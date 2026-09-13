import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createNoopLogger } from '@atlas/logger';
import {
  SCRIBD_SOURCE_ID,
  StaticInstitutionProvider,
  createSearchServices,
  type SearchServices,
} from '@atlas/search-planner';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openAtlasDatabase, searchStoresOf, type AtlasDatabase } from '../../atlas-database.js';
import { openSqliteDatabase, type SqliteDatabase } from '../../sqlite/sqlite-database.js';

let dir: string;
let db: AtlasDatabase;
/** A second, raw connection: verifies stored data independently of repository code. */
let raw: SqliteDatabase;
let services: SearchServices;

const INTENT = {
  countries: ['CA', 'US', 'GB'],
  educationLevels: ['DIPLOMA', 'BACHELOR', 'MASTER'],
  keywords: ['transcript', 'academic-record', 'statement-of-results'],
};

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'atlas-planning-'));
  const filePath = path.join(dir, 'atlas.db');
  db = openAtlasDatabase({ filePath });
  raw = openSqliteDatabase(filePath);
  services = createSearchServices({
    stores: searchStoresOf(db),
    institutionProvider: new StaticInstitutionProvider(),
    logger: createNoopLogger(),
  });
});

afterEach(async () => {
  raw.close();
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const scalar = (sql: string, params: Record<string, string> = {}): number =>
  Number(raw.get(sql, params)?.value ?? Number.NaN);

describe('search planning on SQLite', () => {
  it('persists a plan and creates no duplicate queries or jobs when planned again', async () => {
    const campaign = services.campaigns.createCampaign({
      name: 'Transcript Search Test',
      intent: INTENT,
      sourceIds: [SCRIBD_SOURCE_ID],
    });
    const first = await services.campaigns.planCampaign(campaign.id);
    const second = await services.campaigns.planCampaign(campaign.id);

    expect(first.queryCount).toBeGreaterThan(0);
    expect(second).toMatchObject({
      queryCount: first.queryCount,
      jobCount: first.jobCount,
      newQueryCount: 0,
      newJobCount: 0,
    });
    expect(db.searchQueries.countQueries(campaign.id)).toBe(first.queryCount);
    expect(db.searchJobs.countJobs(campaign.id)).toBe(first.jobCount);
    expect(
      scalar(
        `SELECT COUNT(*) AS value FROM (
           SELECT query_hash FROM search_queries WHERE campaign_id = :id GROUP BY query_hash HAVING COUNT(*) > 1)`,
        { id: campaign.id },
      ),
    ).toBe(0);
    expect(
      scalar(
        `SELECT COUNT(*) AS value FROM (
           SELECT query_id FROM search_jobs WHERE campaign_id = :id
           GROUP BY source_id, query_id HAVING COUNT(*) > 1)`,
        { id: campaign.id },
      ),
    ).toBe(0);
    expect(services.campaigns.getCampaign(campaign.id)).toMatchObject({
      status: 'PLANNED',
      planSummary: { newJobCount: 0, jobCount: first.jobCount },
    });
  });

  it('computes progress from aggregates that match row-level counts', async () => {
    const campaign = services.campaigns.createCampaign({
      name: 'Progress',
      intent: INTENT,
      sourceIds: [SCRIBD_SOURCE_ID],
    });
    const plan = await services.campaigns.planCampaign(campaign.id);
    const done = services.queue.claimNextPendingJob({ campaignId: campaign.id })!;
    services.queue.markCompleted(done.id);
    const broken = services.queue.claimNextPendingJob({ campaignId: campaign.id })!;
    services.queue.markFailed(broken.id, 'Timed out');

    const progress = services.progress.getProgress(campaign.id);
    expect(progress).toMatchObject({
      totalJobs: plan.jobCount,
      completedJobs: 1,
      failedJobs: 1,
      pendingJobs: plan.jobCount - 2,
    });
    for (const country of progress.byCountry) {
      expect(country.total).toBe(
        scalar(
          'SELECT COUNT(*) AS value FROM search_jobs WHERE campaign_id = :id AND country_code = :code',
          {
            id: campaign.id,
            code: country.countryCode,
          },
        ),
      );
      expect(country.total).toBe(plan.jobsByCountry[country.countryCode]);
    }
    expect(progress.byCountry.map((c) => c.countryName)).toEqual([
      'Canada',
      'United Kingdom',
      'USA',
    ]);
    expect(progress.bySource).toEqual([
      expect.objectContaining({
        sourceName: 'Scribd',
        total: plan.jobCount,
        completed: 1,
        failed: 1,
      }),
    ]);
    const institutionTotal = progress.byInstitution.reduce((sum, i) => sum + i.total, 0);
    expect(institutionTotal).toBe(
      scalar(
        'SELECT COUNT(*) AS value FROM search_jobs WHERE campaign_id = :id AND institution_id IS NOT NULL',
        {
          id: campaign.id,
        },
      ),
    );
  });

  it('recovers interrupted jobs through the queue on SQLite', async () => {
    const campaign = services.campaigns.createCampaign({
      name: 'Recover',
      intent: INTENT,
      sourceIds: ['scribd'],
    });
    await services.campaigns.planCampaign(campaign.id);
    services.queue.claimNextPendingJob();
    expect(services.queue.recoverInterruptedJobs()).toEqual({ requeued: 1, failed: 0 });
    expect(services.progress.getProgress(campaign.id).runningJobs).toBe(0);
  });
});
