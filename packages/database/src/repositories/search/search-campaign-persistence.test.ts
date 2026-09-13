import {
  INSTITUTION_FIXTURES,
  SCRIBD_SOURCE_ID,
  SEARCH_CAMPAIGN_STATUSES,
  TRANSCRIPT_SEARCH_VOCABULARY,
  parseSearchIntent,
  type SearchIntent,
} from '@atlas/search-planner';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openAtlasDatabase, type AtlasDatabase } from '../../atlas-database.js';
import { IN_MEMORY } from '../../sqlite/sqlite-database.js';

let db: AtlasDatabase;
let clock: Date;
const tick = () => {
  clock = new Date(clock.getTime() + 1_000);
};

const intent: SearchIntent = parseSearchIntent(
  {
    countries: ['CA', 'US', 'GB'],
    educationLevels: ['DIPLOMA', 'BACHELOR', 'MASTER'],
    keywords: ['transcript'],
  },
  TRANSCRIPT_SEARCH_VOCABULARY,
);

beforeEach(() => {
  clock = new Date('2026-09-13T10:00:00.000Z');
  let nextId = 0;
  db = openAtlasDatabase({
    filePath: IN_MEMORY,
    now: () => clock,
    generateId: () => `id-${++nextId}`,
  });
});

afterEach(() => {
  db.close();
});

describe('migration 0002', () => {
  it('applies after the Phase-1 schema and seeds the Scribd source', () => {
    expect(db.migrations.currentVersion).toBeGreaterThanOrEqual(2);
    expect(db.searchSources.listSources()).toEqual([
      { id: SCRIBD_SOURCE_ID, name: 'Scribd', baseUrl: 'https://www.scribd.com', enabled: true },
    ]);
  });
});

describe('SearchSourceRepository', () => {
  it('adds and disables sources without schema changes', () => {
    db.searchSources.saveSource({
      id: 'source-two',
      name: 'Another Library',
      baseUrl: 'https://library.example',
      enabled: true,
    });
    expect(db.searchSources.setSourceEnabled('source-two', false)).toBe(true);
    expect(db.searchSources.findSource('source-two')).toMatchObject({ enabled: false });
    expect(db.searchSources.listSources()).toHaveLength(2);
  });

  it('rejects non-http base URLs', () => {
    expect(() =>
      db.searchSources.saveSource({
        id: 'bad',
        name: 'Bad',
        baseUrl: 'file:///tmp',
        enabled: true,
      }),
    ).toThrow(/CHECK constraint failed/);
  });
});

describe('SearchCampaignRepository', () => {
  it('creates DRAFT campaigns and round-trips intent and sources', () => {
    const campaign = db.searchCampaigns.createCampaign({
      name: '  Transcript Search Test ',
      intent,
      sourceIds: [SCRIBD_SOURCE_ID],
    });
    expect(campaign).toEqual({
      id: 'id-1',
      name: 'Transcript Search Test',
      status: 'DRAFT',
      // Canonical order: alphabetical by display name (Canada, United Kingdom, USA).
      countries: ['CA', 'GB', 'US'],
      educationLevels: ['DIPLOMA', 'BACHELOR', 'MASTER'],
      transcriptKeywords: ['transcript'],
      intent,
      sourceIds: ['scribd'],
      createdAt: '2026-09-13T10:00:00.000Z',
      updatedAt: '2026-09-13T10:00:00.000Z',
      plannedAt: null,
      startedAt: null,
      completedAt: null,
      lastError: null,
      planSummary: null,
    });
  });

  it('applies guarded status transitions with timestamps, summary and error', () => {
    const campaign = db.searchCampaigns.createCampaign({
      name: 'c',
      intent,
      sourceIds: ['scribd'],
    });
    tick();
    const summary = {
      plannedAt: clock.toISOString(),
      countryCount: 3,
      institutionCount: 14,
      queryCount: 120,
      jobCount: 120,
      duplicatesRemoved: 7,
      newQueryCount: 120,
      newJobCount: 120,
      discardedByLimit: 0,
      jobsByCountry: { CA: 40, US: 40, GB: 40 },
    };
    const planned = db.searchCampaigns.transitionCampaign(campaign.id, {
      from: ['DRAFT', 'PLANNED', 'FAILED'],
      to: 'PLANNED',
      markPlanned: true,
      planSummary: summary,
      lastError: null,
    });
    expect(planned).toMatchObject({
      status: 'PLANNED',
      plannedAt: '2026-09-13T10:00:01.000Z',
      updatedAt: '2026-09-13T10:00:01.000Z',
      planSummary: summary,
      lastError: null,
    });

    // Guard mismatch: nothing changes.
    expect(
      db.searchCampaigns.transitionCampaign(campaign.id, { from: ['RUNNING'], to: 'COMPLETED' }),
    ).toBeUndefined();
    expect(db.searchCampaigns.findCampaign(campaign.id)?.status).toBe('PLANNED');

    db.searchCampaigns.recordCampaignError(campaign.id, 'Provider unavailable');
    expect(db.searchCampaigns.findCampaign(campaign.id)).toMatchObject({
      status: 'PLANNED',
      lastError: 'Provider unavailable',
      planSummary: summary,
    });
  });

  it('accepts every domain status and rejects unknown ones at the schema level', () => {
    const campaign = db.searchCampaigns.createCampaign({ name: 'c', intent, sourceIds: [] });
    for (const status of SEARCH_CAMPAIGN_STATUSES) {
      expect(
        db.searchCampaigns.transitionCampaign(campaign.id, {
          from: SEARCH_CAMPAIGN_STATUSES,
          to: status,
        }),
      ).toMatchObject({ status });
    }
    expect(() =>
      db.searchCampaigns.transitionCampaign(campaign.id, {
        from: ['BOGUS' as 'DRAFT'],
        to: 'PLANNED',
      }),
    ).toThrow(/Unexpected from value/);
  });

  it('lists newest campaigns first', () => {
    db.searchCampaigns.createCampaign({ name: 'first', intent, sourceIds: [] });
    tick();
    db.searchCampaigns.createCampaign({ name: 'second', intent, sourceIds: [] });
    expect(db.searchCampaigns.listCampaigns(10).map((c) => c.name)).toEqual(['second', 'first']);
  });
});

describe('InstitutionRepository', () => {
  it('upserts institutions idempotently', () => {
    db.institutions.upsertInstitutions(INSTITUTION_FIXTURES);
    db.institutions.upsertInstitutions(INSTITUTION_FIXTURES);
    expect(db.institutions.countInstitutions()).toBe(INSTITUTION_FIXTURES.length);
    expect(db.institutions.findInstitution('ca-university-of-toronto')).toMatchObject({
      name: 'University of Toronto',
      aliases: ['U of T', 'UofT'],
      type: 'UNIVERSITY',
    });

    db.institutions.upsertInstitutions([
      { ...INSTITUTION_FIXTURES[0]!, aliases: ['UofT'], source: 'registry-import' },
    ]);
    expect(db.institutions.findInstitution(INSTITUTION_FIXTURES[0]!.id)).toMatchObject({
      aliases: ['UofT'],
      source: 'registry-import',
    });
    expect(db.institutions.listInstitutions('CA').map((i) => i.name)).toContain(
      'McGill University',
    );
  });

  it('rejects a second record for the same institution name in a country', () => {
    db.institutions.upsertInstitutions([INSTITUTION_FIXTURES[0]!]);
    expect(() =>
      db.institutions.upsertInstitutions([
        {
          ...INSTITUTION_FIXTURES[0]!,
          id: 'ca-u-of-toronto-duplicate',
          name: 'university of  TORONTO',
        },
      ]),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('rejects invalid country codes and institution types', () => {
    const base = INSTITUTION_FIXTURES[0]!;
    expect(() =>
      db.institutions.upsertInstitutions([{ ...base, id: 'x1', countryCode: 'ca' }]),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      db.institutions.upsertInstitutions([
        { ...base, id: 'x2', name: 'X', type: 'SCHOOL' as 'OTHER' },
      ]),
    ).toThrow(/CHECK constraint failed/);
  });
});

describe('transaction', () => {
  it('rolls back every write when the work throws', () => {
    expect(() =>
      db.transaction(() => {
        db.searchCampaigns.createCampaign({ name: 'rolled back', intent, sourceIds: [] });
        db.institutions.upsertInstitutions(INSTITUTION_FIXTURES);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(db.searchCampaigns.listCampaigns(10)).toEqual([]);
    expect(db.institutions.countInstitutions()).toBe(0);
  });
});
