import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createNoopLogger } from '@atlas/logger';
import {
  SCRIBD_SOURCE_ID,
  SearchJobQueue,
  TRANSCRIPT_SEARCH_VOCABULARY,
  createJobId,
  createQueryId,
  parseSearchIntent,
  queryIdentity,
} from '@atlas/search-planner';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openAtlasDatabase, type AtlasDatabase } from '../../atlas-database.js';

describe('SearchJobQueue on SQLite', () => {
  let dir: string;
  let first: AtlasDatabase;
  let second: AtlasDatabase;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'atlas-queue-'));
    const filePath = path.join(dir, 'atlas.db');
    first = openAtlasDatabase({ filePath });
    second = openAtlasDatabase({ filePath });
  });

  afterEach(async () => {
    first.close();
    second.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('never hands the same job to two workers on separate connections', () => {
    const campaignId = first.searchCampaigns.createCampaign({
      name: 'Concurrency',
      intent: parseSearchIntent(
        { countries: ['CA'], educationLevels: ['BACHELOR'], keywords: ['transcript'] },
        TRANSCRIPT_SEARCH_VOCABULARY,
      ),
      sourceIds: [SCRIBD_SOURCE_ID],
    }).id;

    first.transaction(() => {
      for (let index = 0; index < 60; index += 1) {
        const text = `Canada transcript variant ${index}`;
        const identity = queryIdentity(text);
        const queryId = createQueryId(campaignId, identity.queryHash);
        first.searchQueries.insertQueries([
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
            priority: index % 7,
            ...identity,
          },
        ]);
        first.searchJobs.insertJobs([
          {
            id: createJobId(campaignId, SCRIBD_SOURCE_ID, identity.queryHash),
            campaignId,
            queryId,
            sourceId: SCRIBD_SOURCE_ID,
            countryCode: 'CA',
            institutionId: null,
            priority: index % 7,
          },
        ]);
      }
    });

    const workers = [first, second].map(
      (database) => new SearchJobQueue({ jobs: database.searchJobs, logger: createNoopLogger() }),
    );
    const claimed: string[] = [];
    const priorities: number[] = [];
    for (let round = 0; round < 40; round += 1) {
      for (const worker of workers) {
        const job = worker.claimNextPendingJob({ campaignId });
        if (job) {
          claimed.push(job.id);
          priorities.push(job.priority);
        }
      }
    }

    expect(claimed).toHaveLength(60);
    expect(new Set(claimed).size).toBe(60);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
    expect(workers[0]!.getNextPendingJob({ campaignId })).toBeUndefined();
  });
});
