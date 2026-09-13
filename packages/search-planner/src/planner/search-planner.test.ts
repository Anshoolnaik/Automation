import { createLogManager, MemoryTransport } from '@atlas/logger';
import { describe, expect, it, vi } from 'vitest';

import { TRANSCRIPT_SEARCH_VOCABULARY } from '../config/vocabulary.js';
import type { Institution } from '../domain/institution.js';
import { parseSearchIntent } from '../domain/search-intent.js';
import { StaticInstitutionProvider } from '../institutions/static-institution-provider.js';
import type { InstitutionProvider } from '../institutions/institution-provider.js';
import { InMemorySearchStores } from '../testing/in-memory-search-stores.js';
import { syntheticInstitutions } from '../testing/planning-fixtures.js';
import type { PlanningLimits } from '../query/planning-limits.js';
import { SearchPlanner } from './search-planner.js';

const INTENT = {
  countries: ['CA', 'GB'],
  educationLevels: ['DIPLOMA', 'BACHELOR', 'MASTER'],
  includeInstitutions: true,
  keywords: ['transcript', 'academic-record', 'statement-of-results'],
};

function setup(options: { provider?: InstitutionProvider; limits?: Partial<PlanningLimits> } = {}) {
  const stores = new InMemorySearchStores();
  const logs = new MemoryTransport({ capacity: 100 });
  const planner = new SearchPlanner({
    ...stores,
    institutionProvider: options.provider ?? new StaticInstitutionProvider(),
    logger: createLogManager({ transports: [logs] }).forComponent('planner'),
    ...(options.limits && { limits: options.limits }),
    now: () => new Date('2026-09-13T12:00:00.000Z'),
  });
  const campaign = stores.campaigns.createCampaign({
    name: 'Transcript Search Test',
    intent: parseSearchIntent(INTENT, TRANSCRIPT_SEARCH_VOCABULARY),
    sourceIds: ['scribd'],
  });
  return { stores, planner, campaign, logs };
}

describe('SearchPlanner', () => {
  it('plans a campaign: institutions, unique queries and one PENDING job per query and source', async () => {
    const { stores, planner, campaign } = setup();
    const result = await planner.plan({
      campaignId: campaign.id,
      intent: INTENT,
      enabledSourceIds: ['scribd'],
    });

    expect(result).toMatchObject({
      campaignId: campaign.id,
      countries: ['CA', 'GB'],
      sourceIds: ['scribd'],
      institutionCount: 9,
      plannedAt: '2026-09-13T12:00:00.000Z',
    });
    expect(result.queryCount).toBeGreaterThan(0);
    expect(result.jobCount).toBe(result.queryCount);
    expect(result.newQueryCount).toBe(result.queryCount);
    expect(result.newJobCount).toBe(result.jobCount);
    expect(result.jobsByCountry.CA! + result.jobsByCountry.GB!).toBe(result.jobCount);
    expect(result.duplicatesRemoved).toBe(result.statistics.duplicatesRemoved);

    expect(stores.countInstitutions()).toBe(9);
    expect(stores.queries.countQueries(campaign.id)).toBe(result.queryCount);
    expect(stores.jobs.countJobs(campaign.id)).toBe(result.jobCount);
    const jobs = stores.jobs.listJobViews(campaign.id, { limit: 10_000, offset: 0 });
    expect(new Set(jobs.map((job) => job.status))).toEqual(new Set(['PENDING']));
    expect(jobs.map((job) => job.queryText)).toEqual(
      expect.arrayContaining(['Canada transcript', '"University of Toronto" transcript']),
    );

    expect(stores.campaigns.findCampaign(campaign.id)).toMatchObject({
      status: 'PLANNED',
      plannedAt: '2026-09-13T12:00:00.000Z',
      lastError: null,
      planSummary: {
        countryCount: 2,
        institutionCount: 9,
        queryCount: result.queryCount,
        jobCount: result.jobCount,
        newJobCount: result.jobCount,
      },
    });
  });

  it('re-planning the same input inserts no duplicate queries or jobs', async () => {
    const { stores, planner, campaign } = setup();
    const first = await planner.plan({
      campaignId: campaign.id,
      intent: INTENT,
      enabledSourceIds: ['scribd'],
    });
    const second = await planner.plan({
      campaignId: campaign.id,
      intent: INTENT,
      enabledSourceIds: ['scribd'],
    });

    expect(second).toMatchObject({
      queryCount: first.queryCount,
      newQueryCount: 0,
      newJobCount: 0,
    });
    expect(stores.queries.countQueries(campaign.id)).toBe(first.queryCount);
    expect(stores.jobs.countJobs(campaign.id)).toBe(first.jobCount);
    expect(stores.campaigns.findCampaign(campaign.id)?.planSummary).toMatchObject({
      newJobCount: 0,
    });
  });

  it('is deterministic across independent runs and input orderings', async () => {
    const a = setup();
    const b = setup({
      provider: {
        name: 'reversed',
        getInstitutions: async (code) =>
          (await new StaticInstitutionProvider().getInstitutions(code)).reverse(),
      },
    });
    await a.planner.plan({
      campaignId: a.campaign.id,
      intent: INTENT,
      enabledSourceIds: ['scribd'],
    });
    await b.planner.plan({
      campaignId: b.campaign.id,
      intent: {
        ...INTENT,
        countries: ['gb', 'CA'],
        educationLevels: ['MASTER', 'BACHELOR', 'DIPLOMA'],
      },
      enabledSourceIds: ['scribd', 'scribd'],
    });
    const logical = (stores: InMemorySearchStores, id: string) =>
      stores.listQueries(id).map(({ queryText, queryHash, priority, strategyId }) => ({
        queryText,
        queryHash,
        priority,
        strategyId,
      }));
    expect(logical(b.stores, b.campaign.id)).toEqual(logical(a.stores, a.campaign.id));
  });

  it('creates source-specific jobs for every enabled source', async () => {
    const { stores, planner, campaign } = setup();
    stores.addSource({
      id: 'source-two',
      name: 'Source Two',
      baseUrl: 'https://two.example',
      enabled: true,
    });
    const result = await planner.plan({
      campaignId: campaign.id,
      intent: INTENT,
      enabledSourceIds: ['source-two', 'scribd'],
    });
    expect(result.sourceIds).toEqual(['scribd', 'source-two']);
    expect(result.jobCount).toBe(result.queryCount * 2);
    expect(stores.campaigns.findCampaign(campaign.id)?.sourceIds).toEqual(['scribd', 'source-two']);
  });

  it('skips institution loading when institutions are excluded', async () => {
    const provider = {
      name: 'spy',
      getInstitutions: vi.fn(() => Promise.resolve([] as Institution[])),
    };
    const { stores, planner, campaign } = setup({ provider });
    const result = await planner.plan({
      campaignId: campaign.id,
      intent: { ...INTENT, includeInstitutions: false },
      enabledSourceIds: ['scribd'],
    });
    expect(provider.getInstitutions).not.toHaveBeenCalled();
    expect(result.institutionCount).toBe(0);
    expect(stores.listQueries(campaign.id).every((q) => q.institutionId === null)).toBe(true);
  });

  it.each([
    ['an unknown campaign', { campaignId: 'nope' }, 'CAMPAIGN_NOT_FOUND'],
    ['an invalid intent', { intent: { ...INTENT, countries: ['ZZ'] } }, 'SEARCH_INTENT_INVALID'],
    ['no sources', { enabledSourceIds: [] }, 'SOURCE_UNAVAILABLE'],
    ['an unknown source', { enabledSourceIds: ['elsewhere'] }, 'SOURCE_UNAVAILABLE'],
  ])('rejects %s', async (_label, override, code) => {
    const { planner, campaign } = setup();
    await expect(
      planner.plan({
        campaignId: campaign.id,
        intent: INTENT,
        enabledSourceIds: ['scribd'],
        ...override,
      }),
    ).rejects.toMatchObject({ code });
  });

  it('rejects disabled sources and campaigns that cannot be planned', async () => {
    const { stores, planner, campaign } = setup();
    stores.addSource({ id: 'off', name: 'Off', baseUrl: 'https://off.example', enabled: false });
    await expect(
      planner.plan({ campaignId: campaign.id, intent: INTENT, enabledSourceIds: ['off'] }),
    ).rejects.toThrow('Search source is disabled: Off');

    stores.campaigns.transitionCampaign(campaign.id, { from: ['DRAFT'], to: 'PLANNED' });
    stores.campaigns.transitionCampaign(campaign.id, { from: ['PLANNED'], to: 'RUNNING' });
    await expect(
      planner.plan({ campaignId: campaign.id, intent: INTENT, enabledSourceIds: ['scribd'] }),
    ).rejects.toMatchObject({ code: 'INVALID_CAMPAIGN_STATE' });
  });

  it('persists nothing when a write fails inside the planning transaction', async () => {
    const { stores, planner, campaign } = setup();
    stores.failNextJobInsert = new Error('disk full');
    await expect(
      planner.plan({ campaignId: campaign.id, intent: INTENT, enabledSourceIds: ['scribd'] }),
    ).rejects.toThrow('disk full');
    expect(stores.queries.countQueries(campaign.id)).toBe(0);
    expect(stores.countInstitutions()).toBe(0);
    expect(stores.campaigns.findCampaign(campaign.id)?.status).toBe('DRAFT');
  });

  it('propagates institution provider failures before writing anything', async () => {
    const { stores, planner, campaign } = setup({
      provider: {
        name: 'broken',
        getInstitutions: () => Promise.reject(new Error('registry offline')),
      },
    });
    await expect(
      planner.plan({ campaignId: campaign.id, intent: INTENT, enabledSourceIds: ['scribd'] }),
    ).rejects.toThrow('registry offline');
    expect(stores.jobs.countJobs(campaign.id)).toBe(0);
  });

  it('reports and logs when planning limits discard queries, keeping the campaign valid', async () => {
    const { stores, planner, campaign, logs } = setup({
      provider: {
        name: 'synthetic',
        getInstitutions: (code) => Promise.resolve(syntheticInstitutions(code, 400)),
      },
      limits: { maxQueriesPerCountry: 50, maxQueriesPerInstitution: 4, maxTotalQueries: 80 },
    });
    const result = await planner.plan({
      campaignId: campaign.id,
      intent: INTENT,
      enabledSourceIds: ['scribd'],
    });

    expect(result.queryCount).toBe(80);
    expect(result.statistics.limitReached).toBe(true);
    expect(result.statistics.discardedByLimit).toBeGreaterThan(0);
    expect(result.statistics.acceptedQueries + result.statistics.discardedByLimit).toBe(
      result.statistics.deduplicatedCandidates,
    );
    expect(
      logs
        .recent()
        .some((entry) => entry.level === 'warn' && /Planning limits discarded/.test(entry.message)),
    ).toBe(true);
    expect(stores.campaigns.findCampaign(campaign.id)).toMatchObject({
      status: 'PLANNED',
      planSummary: { discardedByLimit: result.statistics.discardedByLimit },
    });
  });
});
