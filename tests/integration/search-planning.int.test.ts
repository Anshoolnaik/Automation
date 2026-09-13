import path from 'node:path';

import {
  openAtlasDatabase,
  openSqliteDatabase,
  searchStoresOf,
  type AtlasDatabase,
} from '@atlas/database';
import { createLogManager, MemoryTransport } from '@atlas/logger';
import {
  SCRIBD_SOURCE_ID,
  StaticInstitutionProvider,
  createSearchServices,
  type SearchPlanResult,
} from '@atlas/search-planner';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTempDir } from './support/environment.js';

/**
 * Phase 2 end to end on a real database file: campaign -> plan -> persisted
 * institutions, queries and jobs -> progress, then re-planning and a restart.
 * No browser is involved, so this suite always runs.
 */
describe('Phase-2 search planning (SQLite file)', () => {
  let temp: Awaited<ReturnType<typeof createTempDir>>;
  let filePath: string;
  let database: AtlasDatabase | undefined;

  beforeEach(async () => {
    temp = await createTempDir('search-planning');
    filePath = path.join(temp.dir, 'data', 'atlas.db');
  });

  afterEach(async () => {
    database?.close();
    database = undefined;
    await temp.cleanup();
  });

  const open = () => {
    database?.close();
    database = openAtlasDatabase({ filePath });
    const logs = new MemoryTransport({ capacity: 200 });
    const services = createSearchServices({
      stores: searchStoresOf(database),
      institutionProvider: new StaticInstitutionProvider(),
      logger: createLogManager({ transports: [logs] }).forComponent('search'),
    });
    return { database, services, logs };
  };

  /** Independent verification through a separate raw connection. */
  const rawCount = (sql: string, params: Record<string, string> = {}): number => {
    const raw = openSqliteDatabase(filePath);
    try {
      return Number(raw.get(sql, params)?.count ?? Number.NaN);
    } finally {
      raw.close();
    }
  };

  it('plans a campaign, persists deduplicated work and survives re-planning and restart', async () => {
    const { services, logs } = open();

    const campaign = services.campaigns.createCampaign({
      name: 'Canada and UK transcripts',
      intent: {
        countries: ['CA', 'GB'],
        educationLevels: ['DIPLOMA', 'BACHELOR', 'MASTER'],
        keywords: ['transcript', 'academic-transcript', 'academic-record', 'statement-of-results'],
      },
      sourceIds: [SCRIBD_SOURCE_ID],
    });
    const plan: SearchPlanResult = await services.campaigns.planCampaign(campaign.id);

    // Campaign exists and is planned.
    expect(services.campaigns.getCampaign(campaign.id)).toMatchObject({
      status: 'PLANNED',
      countries: ['CA', 'GB'],
      planSummary: { queryCount: plan.queryCount, jobCount: plan.jobCount },
    });
    expect(logs.recent().some((entry) => entry.message.startsWith('Search plan generated'))).toBe(
      true,
    );

    // Institutions inserted (static fixtures: 5 Canadian, 4 British).
    expect(plan.institutionCount).toBe(9);
    expect(
      rawCount("SELECT COUNT(*) AS count FROM institutions WHERE country_code IN ('CA', 'GB')"),
    ).toBe(9);

    // Queries and one Scribd job per query, all PENDING.
    expect(plan.queryCount).toBeGreaterThan(0);
    expect(plan.jobCount).toBe(plan.queryCount);
    const byCampaign = { id: campaign.id };
    expect(
      rawCount('SELECT COUNT(*) AS count FROM search_queries WHERE campaign_id = :id', byCampaign),
    ).toBe(plan.queryCount);
    expect(
      rawCount('SELECT COUNT(*) AS count FROM search_jobs WHERE campaign_id = :id', byCampaign),
    ).toBe(plan.jobCount);
    expect(
      rawCount(
        "SELECT COUNT(*) AS count FROM search_jobs WHERE campaign_id = :id AND status <> 'PENDING'",
        byCampaign,
      ),
    ).toBe(0);
    expect(
      rawCount(
        "SELECT COUNT(*) AS count FROM search_jobs WHERE campaign_id = :id AND source_id <> 'scribd'",
        byCampaign,
      ),
    ).toBe(0);

    // No duplicate hashes.
    expect(
      rawCount(
        `SELECT COUNT(DISTINCT query_hash) AS count FROM search_queries WHERE campaign_id = :id`,
        byCampaign,
      ),
    ).toBe(plan.queryCount);

    // Progress totals match the database records.
    const progress = services.progress.getProgress(campaign.id);
    expect(progress).toMatchObject({
      totalJobs: plan.jobCount,
      pendingJobs: plan.jobCount,
      completedJobs: 0,
    });
    for (const country of progress.byCountry) {
      expect(country.total).toBe(
        rawCount(
          'SELECT COUNT(*) AS count FROM search_jobs WHERE campaign_id = :id AND country_code = :code',
          {
            ...byCampaign,
            code: country.countryCode,
          },
        ),
      );
    }

    // Expected query shapes.
    const texts = services.campaigns
      .listJobs(campaign.id, { limit: 200, offset: 0 })
      .map((job) => job.queryText);
    expect(texts).toEqual(
      expect.arrayContaining([
        'Canada transcript',
        'Canada academic transcript',
        'Canada diploma transcript',
        '"University of Toronto" transcript',
        '"University of Toronto" bachelor transcript',
        '"University of Toronto" statement of results',
        'United Kingdom statement of results',
      ]),
    );

    // Re-planning creates nothing new.
    const again = await services.campaigns.planCampaign(campaign.id);
    expect(again).toMatchObject({ queryCount: plan.queryCount, newQueryCount: 0, newJobCount: 0 });
    expect(
      rawCount('SELECT COUNT(*) AS count FROM search_jobs WHERE campaign_id = :id', byCampaign),
    ).toBe(plan.jobCount);

    // Restart: a new connection sees the same campaign and jobs; planning again still adds nothing.
    const restarted = open();
    expect(restarted.services.campaigns.listCampaigns().map((c) => c.id)).toEqual([campaign.id]);
    expect(restarted.services.progress.getProgress(campaign.id).totalJobs).toBe(plan.jobCount);
    const afterRestart = await restarted.services.campaigns.planCampaign(campaign.id);
    expect(afterRestart).toMatchObject({
      newQueryCount: 0,
      newJobCount: 0,
      jobCount: plan.jobCount,
    });
    expect(
      rawCount('SELECT COUNT(*) AS count FROM search_queries WHERE campaign_id = :id', byCampaign),
    ).toBe(plan.queryCount);
  });
});
