import { createNoopLogger } from '@atlas/logger';
import { describe, expect, it, vi } from 'vitest';

import { SearchError } from '../domain/errors.js';
import { StaticInstitutionProvider } from '../institutions/static-institution-provider.js';
import { SearchPlanner, type SearchPlanResult } from '../planner/search-planner.js';
import { InMemorySearchStores } from '../testing/in-memory-search-stores.js';
import { MAX_JOB_PAGE_SIZE, SearchCampaignService } from './search-campaign-service.js';

const INTENT = {
  countries: ['CA', 'US', 'GB'],
  educationLevels: ['DIPLOMA', 'BACHELOR', 'MASTER'],
  keywords: ['transcript', 'statement-of-results'],
};

function setup(plan?: SearchPlanner['plan']) {
  const stores = new InMemorySearchStores();
  const planner = new SearchPlanner({
    ...stores,
    institutionProvider: new StaticInstitutionProvider(),
    logger: createNoopLogger(),
  });
  const service = new SearchCampaignService({
    ...stores,
    planner: plan ? { plan } : planner,
    logger: createNoopLogger(),
  });
  return { stores, service };
}

describe('SearchCampaignService', () => {
  it('creates a validated DRAFT campaign with canonical intent', () => {
    const { service } = setup();
    const campaign = service.createCampaign({
      name: '  Transcript   Search Test ',
      intent: INTENT,
      sourceIds: ['scribd'],
    });
    expect(campaign).toMatchObject({
      name: 'Transcript Search Test',
      status: 'DRAFT',
      countries: ['CA', 'GB', 'US'],
      sourceIds: ['scribd'],
      intent: { includeInstitutions: true },
    });
    expect(service.listCampaigns()).toHaveLength(1);
    expect(service.getCampaign(campaign.id).id).toBe(campaign.id);
  });

  it.each([
    ['an empty name', { name: '  ' }, 'CAMPAIGN_INVALID'],
    ['an overly long name', { name: 'x'.repeat(201) }, 'CAMPAIGN_INVALID'],
    [
      'an invalid intent',
      { intent: { ...INTENT, educationLevels: ['PRIMARY'] } },
      'SEARCH_INTENT_INVALID',
    ],
    ['an unknown source', { sourceIds: ['unknown'] }, 'SOURCE_UNAVAILABLE'],
  ])('rejects %s', (_label, override, code) => {
    const { service } = setup();
    expect(() =>
      service.createCampaign({ name: 'Test', intent: INTENT, sourceIds: ['scribd'], ...override }),
    ).toThrow(expect.objectContaining({ code }) as Error);
  });

  it('plans from the stored intent and lists jobs by priority', async () => {
    const { service } = setup();
    const campaign = service.createCampaign({
      name: 'Test',
      intent: INTENT,
      sourceIds: ['scribd'],
    });
    const result = await service.planCampaign(campaign.id);

    expect(result.countries).toEqual(['CA', 'GB', 'US']);
    expect(service.getCampaign(campaign.id).status).toBe('PLANNED');
    const jobs = service.listJobs(campaign.id, { limit: 5, offset: 0 });
    expect(jobs).toHaveLength(5);
    expect(jobs[0]).toMatchObject({
      queryText: '"British Columbia Institute of Technology" transcript',
      status: 'PENDING',
    });
    // Page size is capped; this plan is smaller than the cap, so everything comes back.
    expect(service.listJobs(campaign.id, { limit: 100_000, offset: 0 })).toHaveLength(
      Math.min(result.jobCount, MAX_JOB_PAGE_SIZE),
    );
    expect(service.listJobs(campaign.id, { limit: 5, offset: 5 })[0]?.id).toBe(
      service.listJobs(campaign.id, { limit: 10, offset: 0 })[5]?.id,
    );
  });

  it('marks a never-planned campaign FAILED with a sanitized error when planning fails', async () => {
    const { service } = setup(() =>
      Promise.reject(new Error('registry offline at https://registry.example/?token=abc')),
    );
    const campaign = service.createCampaign({
      name: 'Test',
      intent: INTENT,
      sourceIds: ['scribd'],
    });
    await expect(service.planCampaign(campaign.id)).rejects.toThrow('registry offline');
    expect(service.getCampaign(campaign.id)).toMatchObject({
      status: 'FAILED',
      lastError: 'registry offline at https://registry.example/?token=[REDACTED]',
    });
  });

  it('keeps an existing plan PLANNED but records the error when re-planning fails', async () => {
    const { service, stores } = setup();
    const campaign = service.createCampaign({
      name: 'Test',
      intent: INTENT,
      sourceIds: ['scribd'],
    });
    await service.planCampaign(campaign.id);
    stores.addSource({
      id: 'scribd',
      name: 'Scribd',
      baseUrl: 'https://www.scribd.com',
      enabled: false,
    });

    await expect(service.planCampaign(campaign.id)).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
    });
    expect(service.getCampaign(campaign.id)).toMatchObject({
      status: 'PLANNED',
      lastError: 'Search source is disabled: Scribd',
    });
  });

  it('refuses concurrent planning of the same campaign', async () => {
    let release: (value: SearchPlanResult) => void = () => undefined;
    const plan = vi.fn(() => new Promise<SearchPlanResult>((resolve) => (release = resolve)));
    const { service } = setup(plan);
    const campaign = service.createCampaign({
      name: 'Test',
      intent: INTENT,
      sourceIds: ['scribd'],
    });

    const first = service.planCampaign(campaign.id);
    await expect(service.planCampaign(campaign.id)).rejects.toMatchObject({
      code: 'CAMPAIGN_BUSY',
    });
    release({} as SearchPlanResult);
    await first;
    expect(plan).toHaveBeenCalledTimes(1);
    expect(service.getCampaign(campaign.id).lastError).toBeNull();
  });

  it('reports unknown campaigns', async () => {
    const { service } = setup();
    expect(() => service.getCampaign('missing')).toThrow(SearchError);
    await expect(service.planCampaign('missing')).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
    expect(() => service.listJobs('missing', { limit: 10, offset: 0 })).toThrow(/not found/);
  });
});
