import {
  INSTITUTION_FIXTURES,
  SCRIBD_SOURCE_ID,
  TRANSCRIPT_SEARCH_VOCABULARY,
  createJobId,
  createQueryId,
  parseSearchIntent,
  queryIdentity,
  type NewSearchJob,
  type SearchQuery,
} from '@atlas/search-planner';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openAtlasDatabase, type AtlasDatabase } from '../../atlas-database.js';
import { IN_MEMORY } from '../../sqlite/sqlite-database.js';

let db: AtlasDatabase;
let clock: Date;
let campaignId: string;

const intent = parseSearchIntent(
  { countries: ['CA'], educationLevels: ['BACHELOR'], keywords: ['transcript'] },
  TRANSCRIPT_SEARCH_VOCABULARY,
);

function makeQuery(text: string, overrides: Partial<SearchQuery> = {}): SearchQuery {
  const identity = queryIdentity(text);
  const campaign = overrides.campaignId ?? campaignId;
  return {
    id: createQueryId(campaign, identity.queryHash),
    campaignId: campaign,
    strategyId: 'COUNTRY_BROAD',
    countryCode: 'CA',
    institutionId: null,
    educationLevel: null,
    transcriptKeywordId: 'transcript',
    program: null,
    queryText: text,
    priority: 600,
    ...identity,
    ...overrides,
  };
}

function jobFor(query: SearchQuery, overrides: Partial<NewSearchJob> = {}): NewSearchJob {
  const sourceId = overrides.sourceId ?? SCRIBD_SOURCE_ID;
  return {
    id: createJobId(query.campaignId, sourceId, query.queryHash),
    campaignId: query.campaignId,
    queryId: query.id,
    sourceId,
    countryCode: query.countryCode,
    institutionId: query.institutionId,
    priority: query.priority,
    ...overrides,
  };
}

beforeEach(() => {
  clock = new Date('2026-09-13T10:00:00.000Z');
  db = openAtlasDatabase({ filePath: IN_MEMORY, now: () => clock });
  db.searchSources.saveSource({
    id: 'source-two',
    name: 'Source Two',
    baseUrl: 'https://two.example',
    enabled: true,
  });
  campaignId = db.searchCampaigns.createCampaign({
    name: 'c',
    intent,
    sourceIds: [SCRIBD_SOURCE_ID],
  }).id;
});

afterEach(() => {
  db.close();
});

describe('SearchQueryRepository', () => {
  it('stores queries and ignores equivalent ones through the database constraint', () => {
    const query = makeQuery('Canada transcript');
    expect(db.searchQueries.insertQueries([query])).toBe(1);
    expect(db.searchQueries.insertQueries([query])).toBe(0);

    // Same normalized query under a different ID: the UNIQUE (campaign, hash) constraint rejects it.
    const sameHashOtherId = { ...makeQuery('CANADA   transcript'), id: 'q_rogue' };
    expect(sameHashOtherId.queryHash).toBe(query.queryHash);
    expect(db.searchQueries.insertQueries([sameHashOtherId])).toBe(0);

    expect(db.searchQueries.countQueries(campaignId)).toBe(1);
    expect(db.searchQueries.listQueries(campaignId)).toEqual([query]);
  });

  it('allows the same logical query in different campaigns', () => {
    const other = db.searchCampaigns.createCampaign({ name: 'other', intent, sourceIds: [] }).id;
    db.searchQueries.insertQueries([makeQuery('Canada transcript')]);
    expect(
      db.searchQueries.insertQueries([makeQuery('Canada transcript', { campaignId: other })]),
    ).toBe(1);
  });

  it('enforces hash format, strategy vocabulary and institution references', () => {
    expect(() =>
      db.searchQueries.insertQueries([makeQuery('a', { queryHash: 'not-a-hash' })]),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      db.searchQueries.insertQueries([makeQuery('b', { strategyId: 'RANDOM' as 'COUNTRY_BROAD' })]),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      db.searchQueries.insertQueries([makeQuery('c', { institutionId: 'missing-institution' })]),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });
});

describe('SearchJobRepository', () => {
  let query: SearchQuery;

  beforeEach(() => {
    query = makeQuery('Canada transcript');
    db.searchQueries.insertQueries([query]);
  });

  it('creates one job per (campaign, source, query)', () => {
    expect(db.searchJobs.insertJobs([jobFor(query)])).toBe(1);
    expect(db.searchJobs.insertJobs([jobFor(query)])).toBe(0);
    expect(db.searchJobs.insertJobs([jobFor(query, { id: 'j_rogue' })])).toBe(0);
    // The same query against another source is separate work.
    expect(db.searchJobs.insertJobs([jobFor(query, { sourceId: 'source-two' })])).toBe(1);
    expect(db.searchJobs.countJobs(campaignId)).toBe(2);

    expect(db.searchJobs.findJob(jobFor(query).id)).toMatchObject({
      status: 'PENDING',
      attemptCount: 0,
      currentPage: 0,
      discoveredCount: 0,
      startedAt: null,
      completedAt: null,
      lastError: null,
    });
  });

  it('refuses a job whose query belongs to another campaign', () => {
    const other = db.searchCampaigns.createCampaign({ name: 'other', intent, sourceIds: [] }).id;
    expect(() =>
      db.searchJobs.insertJobs([jobFor(query, { campaignId: other, id: 'j_x' })]),
    ).toThrow(/FOREIGN KEY constraint failed/);
    expect(() => db.searchJobs.insertJobs([jobFor(query, { sourceId: 'unknown-source' })])).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });

  it('claims pending jobs by priority, then creation order, atomically', () => {
    const low = makeQuery('Canada academic statement', { priority: 400 });
    const highA = makeQuery('Canada academic record', { priority: 900 });
    const highB = makeQuery('Canada statement of results', { priority: 900 });
    db.searchQueries.insertQueries([low, highA]);
    db.searchJobs.insertJobs([jobFor(low), jobFor(highA), jobFor(query)]);
    clock = new Date(clock.getTime() + 1_000);
    db.searchQueries.insertQueries([highB]);
    db.searchJobs.insertJobs([jobFor(highB)]);

    expect(db.searchJobs.peekNextPendingJob({ maxAttempts: 3 })?.queryId).toBe(highA.id);
    const claimed = [1, 2, 3, 4, 5].map(() =>
      db.searchJobs.claimNextPendingJob({ maxAttempts: 3 }),
    );
    expect(claimed.map((job) => job?.queryId)).toEqual([
      highA.id,
      highB.id,
      query.id,
      low.id,
      undefined,
    ]);
    expect(claimed[0]).toMatchObject({
      status: 'RUNNING',
      attemptCount: 1,
      startedAt: clock.toISOString(),
    });
  });

  it('filters claims by campaign, source and remaining attempts', () => {
    db.searchJobs.insertJobs([jobFor(query), jobFor(query, { sourceId: 'source-two' })]);
    expect(
      db.searchJobs.claimNextPendingJob({ maxAttempts: 3, sourceId: 'source-two' })?.sourceId,
    ).toBe('source-two');
    expect(
      db.searchJobs.claimNextPendingJob({ maxAttempts: 3, campaignId: 'other' }),
    ).toBeUndefined();
    expect(db.searchJobs.claimNextPendingJob({ maxAttempts: 0 })).toBeUndefined();
  });

  it('guards status transitions and attempt limits in SQL', () => {
    const [job] = [jobFor(query)];
    db.searchJobs.insertJobs([job!]);
    const id = job!.id;

    expect(db.searchJobs.transitionJob(id, { from: ['RUNNING'], to: 'COMPLETED' })).toBeUndefined();
    const running = db.searchJobs.transitionJob(id, {
      from: ['PENDING'],
      to: 'RUNNING',
      markStarted: true,
      incrementAttempt: true,
      requireAttemptsBelow: 1,
    });
    expect(running).toMatchObject({ status: 'RUNNING', attemptCount: 1 });

    const failed = db.searchJobs.transitionJob(id, {
      from: ['RUNNING'],
      to: 'FAILED',
      markCompleted: true,
      lastError: 'Timed out',
    });
    expect(failed).toMatchObject({ status: 'FAILED', lastError: 'Timed out' });
    expect(failed?.completedAt).not.toBeNull();

    // Retry refused once the attempt budget is used.
    expect(
      db.searchJobs.transitionJob(id, { from: ['FAILED'], to: 'PENDING', requireAttemptsBelow: 1 }),
    ).toBeUndefined();
    expect(
      db.searchJobs.transitionJob(id, {
        from: ['FAILED'],
        to: 'PENDING',
        clearCompleted: true,
        requireAttemptsBelow: 3,
      }),
    ).toMatchObject({ status: 'PENDING', completedAt: null, lastError: 'Timed out' });
  });

  it('updates running jobs only, with a monotonic current page', () => {
    db.searchJobs.insertJobs([jobFor(query)]);
    const id = jobFor(query).id;
    expect(db.searchJobs.updateRunningJob(id, { currentPage: 1 })).toBeUndefined();

    db.searchJobs.claimNextPendingJob({ maxAttempts: 3 });
    expect(
      db.searchJobs.updateRunningJob(id, { currentPage: 2, discoveredDelta: 5 }),
    ).toMatchObject({
      currentPage: 2,
      discoveredCount: 5,
    });
    expect(db.searchJobs.updateRunningJob(id, { currentPage: 1 })).toBeUndefined();
    expect(db.searchJobs.updateRunningJob(id, { discoveredDelta: 3 })).toMatchObject({
      currentPage: 2,
      discoveredCount: 8,
    });
  });

  it('pauses and resumes a campaign’s jobs in bulk', () => {
    db.searchJobs.insertJobs([jobFor(query), jobFor(query, { sourceId: 'source-two' })]);
    db.searchJobs.claimNextPendingJob({ maxAttempts: 3 });
    expect(db.searchJobs.transitionCampaignJobs(campaignId, ['PENDING'], 'PAUSED')).toBe(1);
    expect(db.searchJobs.transitionCampaignJobs(campaignId, ['PAUSED'], 'PENDING')).toBe(1);
  });

  it('recovers jobs left RUNNING by a crash', () => {
    const second = makeQuery('Canada academic record');
    db.searchQueries.insertQueries([second]);
    db.searchJobs.insertJobs([jobFor(query), jobFor(second)]);
    db.searchJobs.claimNextPendingJob({ maxAttempts: 3 });
    const exhausted = db.searchJobs.claimNextPendingJob({ maxAttempts: 3 })!;
    db.searchJobs.updateRunningJob(exhausted.id, { incrementAttempt: true });
    db.searchJobs.updateRunningJob(exhausted.id, { incrementAttempt: true });

    expect(db.searchJobs.recoverInterruptedJobs(3, 'Interrupted')).toEqual({
      requeued: 1,
      failed: 1,
    });
    expect(db.searchJobs.findJob(exhausted.id)).toMatchObject({
      status: 'FAILED',
      lastError: 'Interrupted',
    });
  });

  it('lists jobs with query text, source and institution names', () => {
    db.institutions.upsertInstitutions(INSTITUTION_FIXTURES);
    const institutionQuery = makeQuery('"University of Toronto" transcript', {
      strategyId: 'INSTITUTION_BROAD',
      institutionId: 'ca-university-of-toronto',
      priority: 910,
    });
    db.searchQueries.insertQueries([institutionQuery]);
    db.searchJobs.insertJobs([jobFor(query), jobFor(institutionQuery)]);

    const views = db.searchJobs.listJobViews(campaignId, { limit: 10, offset: 0 });
    expect(views.map((v) => [v.queryText, v.sourceName, v.institutionName])).toEqual([
      ['"University of Toronto" transcript', 'Scribd', 'University of Toronto'],
      ['Canada transcript', 'Scribd', null],
    ]);
    expect(db.searchJobs.listJobViews(campaignId, { limit: 1, offset: 1 })).toHaveLength(1);
  });
});
