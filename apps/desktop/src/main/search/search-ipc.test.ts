import { openAtlasDatabase, searchStoresOf, type AtlasDatabase } from '@atlas/database';
import { createNoopLogger } from '@atlas/logger';
import {
  EDUCATION_LEVELS,
  SEARCH_CAMPAIGN_STATUSES,
  SEARCH_JOB_STATUSES,
  StaticInstitutionProvider,
  createSearchServices,
} from '@atlas/search-planner';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { IpcChannel } from '../../shared/ipc-channels.js';
import type {
  IpcResult,
  SearchCampaignDto,
  SearchJobDto,
  SearchProgressDto,
} from '../../shared/ipc-types.js';
import {
  EDUCATION_LEVEL_VALUES,
  SEARCH_CAMPAIGN_STATUS_VALUES,
  SEARCH_JOB_STATUS_VALUES,
  TEST_CAMPAIGN_PRESET,
} from '../../shared/search-vocabulary.js';
import { createRequestHandlerFactory } from '../ipc/request-handler.js';
import { createSearchIpcHandlers } from '../ipc/search-ipc-handlers.js';
import type { LogSubscriber } from '../logging/log-broadcaster.js';
import { createSearchFacade } from './search-facade.js';

const sender: LogSubscriber = { id: 1, isDestroyed: () => false, send: () => undefined };

let database: AtlasDatabase;
let shuttingDown: boolean;

function handlers() {
  const services = createSearchServices({
    stores: searchStoresOf(database),
    institutionProvider: new StaticInstitutionProvider(),
    logger: createNoopLogger(),
  });
  const handle = createRequestHandlerFactory({
    logger: createNoopLogger(),
    isShuttingDown: () => shuttingDown,
  });
  return createSearchIpcHandlers(createSearchFacade(services, database.searchSources), handle);
}

async function call<T>(
  channel: keyof ReturnType<typeof handlers>,
  payload?: unknown,
): Promise<IpcResult<T>> {
  return (await handlers()[channel](payload, sender)) as IpcResult<T>;
}

function data<T>(result: IpcResult<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}

beforeEach(() => {
  database = openAtlasDatabase({ filePath: ':memory:' });
  shuttingDown = false;
});

afterEach(() => {
  database.close();
});

describe('search IPC', () => {
  it('creates the test campaign, plans it and exposes summary, progress and jobs', async () => {
    const created = data(
      await call<SearchCampaignDto>(IpcChannel.SearchCreateCampaign, {
        ...TEST_CAMPAIGN_PRESET,
        countries: [...TEST_CAMPAIGN_PRESET.countries],
        educationLevels: [...TEST_CAMPAIGN_PRESET.educationLevels],
        sourceIds: [...TEST_CAMPAIGN_PRESET.sourceIds],
      }),
    );
    expect(created).toMatchObject({
      name: 'Transcript Search Test',
      status: 'DRAFT',
      countries: [
        { code: 'CA', name: 'Canada' },
        { code: 'GB', name: 'United Kingdom' },
        { code: 'US', name: 'USA' },
      ],
      educationLevels: [
        { code: 'DIPLOMA', name: 'Diploma' },
        { code: 'BACHELOR', name: "Bachelor's Degree" },
        { code: 'MASTER', name: "Master's Degree" },
      ],
      sources: [{ code: 'scribd', name: 'Scribd' }],
      keywordCount: 10,
      includeInstitutions: true,
      planSummary: null,
    });

    const planned = data(
      await call<SearchCampaignDto>(IpcChannel.SearchPlanCampaign, { campaignId: created.id }),
    );
    expect(planned.status).toBe('PLANNED');
    expect(planned.planSummary).toMatchObject({
      countryCount: 3,
      newJobCount: planned.planSummary?.jobCount,
    });
    expect(planned.planSummary!.institutionCount).toBeGreaterThan(0);
    expect(planned.planSummary!.queryCount).toBeGreaterThan(0);
    expect(planned.planSummary!.jobsByCountry.map((c) => c.name)).toEqual([
      'Canada',
      'United Kingdom',
      'USA',
    ]);

    const replanned = data(
      await call<SearchCampaignDto>(IpcChannel.SearchPlanCampaign, { campaignId: created.id }),
    );
    expect(replanned.planSummary).toMatchObject({
      newQueryCount: 0,
      newJobCount: 0,
      jobCount: planned.planSummary!.jobCount,
    });

    const progress = data(
      await call<SearchProgressDto>(IpcChannel.SearchGetProgress, { campaignId: created.id }),
    );
    expect(progress).toMatchObject({
      totalJobs: planned.planSummary!.jobCount,
      pendingJobs: planned.planSummary!.jobCount,
    });
    expect(progress.byCountry.map((row) => row.code)).toEqual(['CA', 'GB', 'US']);

    const jobs = data(
      await call<SearchJobDto[]>(IpcChannel.SearchListJobs, { campaignId: created.id, limit: 200 }),
    );
    const texts = jobs.map((job) => job.queryText);
    expect(texts).toEqual(
      expect.arrayContaining([
        '"University of Toronto" transcript',
        '"University of Toronto" bachelor transcript',
        '"University of Toronto" statement of results',
        'Canada diploma transcript',
        'Canada academic transcript',
      ]),
    );
    expect(jobs[0]).toMatchObject({ status: 'PENDING', sourceName: 'Scribd', attemptCount: 0 });

    const listed = data(await call<SearchCampaignDto[]>(IpcChannel.SearchListCampaigns));
    expect(listed.map((campaign) => campaign.id)).toEqual([created.id]);
  });

  it.each([
    [
      'unknown fields',
      { ...TEST_CAMPAIGN_PRESET, sql: 'DROP TABLE search_jobs' },
      'INVALID_REQUEST',
    ],
    ['no countries', { ...TEST_CAMPAIGN_PRESET, countries: [] }, 'INVALID_REQUEST'],
    [
      'a country name instead of a code',
      { ...TEST_CAMPAIGN_PRESET, countries: ['United Kingdom'] },
      'INVALID_REQUEST',
    ],
    ['an unknown country code', { ...TEST_CAMPAIGN_PRESET, countries: ['XX'] }, 'INVALID_REQUEST'],
    [
      'an invalid education level',
      { ...TEST_CAMPAIGN_PRESET, educationLevels: ['PRIMARY'] },
      'INVALID_REQUEST',
    ],
    ['empty keywords', { ...TEST_CAMPAIGN_PRESET, keywords: [] }, 'INVALID_REQUEST'],
    ['an unknown source', { ...TEST_CAMPAIGN_PRESET, sourceIds: ['elsewhere'] }, 'INVALID_REQUEST'],
    ['a missing payload', undefined, 'INVALID_REQUEST'],
  ])('rejects create-campaign with %s', async (_label, payload, code) => {
    const result = await call(IpcChannel.SearchCreateCampaign, payload);
    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(database.searchCampaigns.listCampaigns(10)).toEqual([]);
  });

  it('validates identifiers and paging, and reports missing campaigns as NOT_FOUND', async () => {
    expect(await call(IpcChannel.SearchPlanCampaign, { id: 'x' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect(await call(IpcChannel.SearchListJobs, { campaignId: 'x', limit: 5_000 })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect(await call(IpcChannel.SearchGetCampaign, { campaignId: 'missing' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(await call(IpcChannel.SearchGetProgress, { campaignId: 'missing' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(await call(IpcChannel.SearchListCampaigns, { all: true })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
  });

  it('refuses to create or plan campaigns during shutdown', async () => {
    shuttingDown = true;
    expect(await call(IpcChannel.SearchCreateCampaign, TEST_CAMPAIGN_PRESET)).toMatchObject({
      ok: false,
      error: { code: 'SHUTTING_DOWN' },
    });
    expect(data(await call<SearchCampaignDto[]>(IpcChannel.SearchListCampaigns))).toEqual([]);
  });
});

describe('shared search vocabulary', () => {
  it('stays identical to the search-planner domain definitions', () => {
    expect([...SEARCH_CAMPAIGN_STATUS_VALUES]).toEqual([...SEARCH_CAMPAIGN_STATUSES]);
    expect([...SEARCH_JOB_STATUS_VALUES]).toEqual([...SEARCH_JOB_STATUSES]);
    expect([...EDUCATION_LEVEL_VALUES]).toEqual([...EDUCATION_LEVELS]);
  });
});
