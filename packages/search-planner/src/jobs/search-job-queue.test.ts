import { createNoopLogger } from '@atlas/logger';
import { beforeEach, describe, expect, it } from 'vitest';

import { TRANSCRIPT_SEARCH_VOCABULARY } from '../config/vocabulary.js';
import { SearchError } from '../domain/errors.js';
import { parseSearchIntent } from '../domain/search-intent.js';
import { createJobId, createQueryId, queryIdentity } from '../query/normalize-query.js';
import { InMemorySearchStores } from '../testing/in-memory-search-stores.js';
import { SearchJobQueue } from './search-job-queue.js';

let clock: Date;
let stores: InMemorySearchStores;
let queue: SearchJobQueue;
let campaignId: string;

function addJob(text: string, priority: number, sourceId = 'scribd'): string {
  const identity = queryIdentity(text);
  const queryId = createQueryId(campaignId, identity.queryHash);
  stores.queries.insertQueries([
    {
      id: queryId,
      campaignId,
      strategyId: 'COUNTRY_BROAD',
      countryCode: 'CA',
      institutionId: null,
      educationLevel: null,
      transcriptKeywordId: 'transcript',
      program: null,
      queryText: text,
      priority,
      ...identity,
    },
  ]);
  const id = createJobId(campaignId, sourceId, identity.queryHash);
  stores.jobs.insertJobs([
    { id, campaignId, queryId, sourceId, countryCode: 'CA', institutionId: null, priority },
  ]);
  return id;
}

beforeEach(() => {
  clock = new Date('2026-09-13T12:00:00.000Z');
  stores = new InMemorySearchStores(() => clock);
  stores.addSource({ id: 'other', name: 'Other', baseUrl: 'https://other.example', enabled: true });
  queue = new SearchJobQueue({ jobs: stores.jobs, logger: createNoopLogger(), maxAttempts: 2 });
  campaignId = stores.campaigns.createCampaign({
    name: 'Queue',
    intent: parseSearchIntent(
      { countries: ['CA'], educationLevels: ['BACHELOR'], keywords: ['transcript'] },
      TRANSCRIPT_SEARCH_VOCABULARY,
    ),
    sourceIds: ['scribd'],
  }).id;
});

const codeOf = (fn: () => unknown) => {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error instanceof SearchError ? error.code : 'OTHER';
  }
};

describe('SearchJobQueue ordering', () => {
  it('returns the highest priority job first, then the oldest', () => {
    const low = addJob('Canada academic statement', 400);
    const highOld = addJob('Canada transcript', 900);
    clock = new Date(clock.getTime() + 1_000);
    const highNew = addJob('Canada academic record', 900);
    const middle = addJob('Canada diploma transcript', 500);

    expect(queue.getNextPendingJob()?.id).toBe(highOld);
    expect(queue.getNextPendingJob()?.id).toBe(highOld); // peeking does not claim
    const order = [1, 2, 3, 4, 5].map(() => queue.claimNextPendingJob()?.id);
    expect(order).toEqual([highOld, highNew, middle, low, undefined]);
  });

  it('filters by campaign and source', () => {
    addJob('Canada transcript', 900);
    const other = addJob('Canada transcript', 100, 'other');
    expect(queue.getNextPendingJob({ sourceId: 'other' })?.id).toBe(other);
    expect(queue.getNextPendingJob({ campaignId: 'another-campaign' })).toBeUndefined();
  });
});

describe('SearchJobQueue transitions', () => {
  it('runs a job to completion: PENDING -> RUNNING -> COMPLETED', () => {
    const id = addJob('Canada transcript', 900);
    expect(queue.markRunning(id)).toMatchObject({ status: 'RUNNING', attemptCount: 1 });
    expect(queue.updateCurrentPage(id, 2)).toMatchObject({ currentPage: 2 });
    expect(queue.incrementDiscoveredCount(id, 7)).toMatchObject({ discoveredCount: 7 });
    expect(queue.incrementDiscoveredCount(id)).toMatchObject({ discoveredCount: 8 });
    const done = queue.markCompleted(id);
    expect(done).toMatchObject({ status: 'COMPLETED', lastError: null });
    expect(done.completedAt).not.toBeNull();
  });

  it('rejects invalid transitions with explicit errors', () => {
    const id = addJob('Canada transcript', 900);
    expect(codeOf(() => queue.markCompleted(id))).toBe('INVALID_JOB_STATE');
    expect(codeOf(() => queue.markFailed(id, 'x'))).toBe('INVALID_JOB_STATE');
    expect(codeOf(() => queue.retry(id))).toBe('INVALID_JOB_STATE');
    expect(codeOf(() => queue.updateCurrentPage(id, 1))).toBe('INVALID_JOB_STATE');
    expect(codeOf(() => queue.markRunning('missing'))).toBe('JOB_NOT_FOUND');
    expect(() => queue.markRunning(id)).not.toThrow();
    expect(() => queue.markRunning(id)).toThrow('cannot move from RUNNING to RUNNING');
  });

  it('retries failed jobs until the attempt limit, then refuses', () => {
    const id = addJob('Canada transcript', 900);
    queue.markRunning(id);
    expect(
      queue.markFailed(id, new Error('Timeout at https://x.example/?token=secret')),
    ).toMatchObject({
      status: 'FAILED',
      attemptCount: 1,
      lastError: 'Timeout at https://x.example/?token=[REDACTED]',
    });

    expect(queue.retry(id)).toMatchObject({ status: 'PENDING', completedAt: null });
    queue.markRunning(id);
    queue.markFailed(id, 'Timeout again');

    expect(codeOf(() => queue.retry(id))).toBe('MAX_ATTEMPTS_EXCEEDED');
    expect(queue.getNextPendingJob()).toBeUndefined();
    expect(queue.skip(id, 'Gave up')).toMatchObject({ status: 'SKIPPED', lastError: 'Gave up' });
  });

  it('enforces the attempt limit within a run', () => {
    const id = addJob('Canada transcript', 900);
    queue.markRunning(id);
    expect(queue.incrementAttempt(id)).toMatchObject({ attemptCount: 2 });
    expect(codeOf(() => queue.incrementAttempt(id))).toBe('MAX_ATTEMPTS_EXCEEDED');
  });

  it('keeps the current page monotonic', () => {
    const id = addJob('Canada transcript', 900);
    queue.markRunning(id);
    queue.updateCurrentPage(id, 3);
    expect(codeOf(() => queue.updateCurrentPage(id, 2))).toBe('INVALID_JOB_STATE');
    expect(() => queue.updateCurrentPage(id, -1)).toThrow(RangeError);
    expect(() => queue.incrementDiscoveredCount(id, -5)).toThrow(RangeError);
  });

  it('pauses and resumes individual jobs and whole campaigns', () => {
    const a = addJob('Canada transcript', 900);
    const b = addJob('Canada academic record', 800);
    expect(queue.pause(a)).toMatchObject({ status: 'PAUSED' });
    expect(queue.getNextPendingJob()?.id).toBe(b);
    expect(queue.resume(a)).toMatchObject({ status: 'PENDING' });

    expect(queue.pauseCampaign(campaignId)).toBe(2);
    expect(queue.claimNextPendingJob()).toBeUndefined();
    expect(queue.resumeCampaign(campaignId)).toBe(2);
    expect(queue.claimNextPendingJob()?.id).toBe(a);
    expect(queue.pause(a)).toMatchObject({ status: 'PAUSED' }); // a running job can be paused
  });

  it('recovers jobs interrupted while RUNNING', () => {
    const requeue = addJob('Canada transcript', 900);
    const exhausted = addJob('Canada academic record', 800);
    queue.markRunning(requeue);
    queue.markRunning(exhausted);
    queue.incrementAttempt(exhausted);

    expect(queue.recoverInterruptedJobs()).toEqual({ requeued: 1, failed: 1 });
    expect(stores.jobs.findJob(requeue)).toMatchObject({ status: 'PENDING', attemptCount: 1 });
    expect(stores.jobs.findJob(exhausted)).toMatchObject({ status: 'FAILED' });
  });

  it('validates its configuration', () => {
    expect(
      () => new SearchJobQueue({ jobs: stores.jobs, logger: createNoopLogger(), maxAttempts: 0 }),
    ).toThrow(RangeError);
    expect(new SearchJobQueue({ jobs: stores.jobs, logger: createNoopLogger() }).maxAttempts).toBe(
      3,
    );
  });
});
