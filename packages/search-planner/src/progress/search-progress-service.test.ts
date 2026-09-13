import { createNoopLogger } from '@atlas/logger';
import { describe, expect, it } from 'vitest';

import { StaticInstitutionProvider } from '../institutions/static-institution-provider.js';
import { createSearchServices } from '../services.js';
import { InMemorySearchStores } from '../testing/in-memory-search-stores.js';
import { SearchProgressService } from './search-progress-service.js';

async function plannedCampaign() {
  const stores = new InMemorySearchStores();
  const services = createSearchServices({
    stores,
    institutionProvider: new StaticInstitutionProvider(),
    logger: createNoopLogger(),
  });
  const campaign = services.campaigns.createCampaign({
    name: 'Progress',
    intent: {
      countries: ['US', 'CA', 'FJ'],
      educationLevels: ['BACHELOR'],
      keywords: ['transcript'],
    },
    sourceIds: ['scribd'],
  });
  const plan = await services.campaigns.planCampaign(campaign.id);
  return { stores, services, campaignId: campaign.id, plan };
}

describe('SearchProgressService', () => {
  it('reports an empty campaign as zero without dividing by zero', () => {
    const service = new SearchProgressService({ progress: new InMemorySearchStores().progress });
    expect(service.getProgress('none')).toEqual({
      campaignId: 'none',
      totalJobs: 0,
      pendingJobs: 0,
      runningJobs: 0,
      pausedJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      skippedJobs: 0,
      completedPercent: 0,
      byCountry: [],
      bySource: [],
      byInstitution: [],
    });
  });

  it('matches the plan right after planning: every job pending', async () => {
    const { services, campaignId, plan } = await plannedCampaign();
    const progress = services.progress.getProgress(campaignId);

    expect(progress).toMatchObject({
      totalJobs: plan.jobCount,
      pendingJobs: plan.jobCount,
      completedJobs: 0,
      completedPercent: 0,
    });
    expect(progress.byCountry.map((c) => [c.countryCode, c.countryName, c.total])).toEqual([
      ['CA', 'Canada', plan.jobsByCountry.CA],
      ['FJ', 'Fiji', plan.jobsByCountry.FJ],
      ['US', 'USA', plan.jobsByCountry.US],
    ]);
    expect(progress.bySource).toEqual([
      {
        sourceId: 'scribd',
        sourceName: 'Scribd',
        total: plan.jobCount,
        completed: 0,
        failed: 0,
        remaining: plan.jobCount,
      },
    ]);
    expect(progress.byInstitution.map((i) => i.institutionName)).toContain('University of Toronto');
    // Fiji has no fixture institutions: its jobs are all country-level.
    expect(progress.byInstitution.every((i) => !i.institutionId.startsWith('fj-'))).toBe(true);
  });

  it('tracks totals as jobs run, complete, fail and pause', async () => {
    const { services, campaignId, plan } = await plannedCampaign();
    const { queue } = services;

    const completed = queue.claimNextPendingJob({ campaignId })!;
    queue.markCompleted(completed.id);
    const failed = queue.claimNextPendingJob({ campaignId })!;
    queue.markFailed(failed.id, 'Search page did not load');
    queue.claimNextPendingJob({ campaignId });
    const paused = queue.getNextPendingJob({ campaignId })!;
    queue.pause(paused.id);

    const progress = services.progress.getProgress(campaignId);
    expect(progress).toMatchObject({
      totalJobs: plan.jobCount,
      completedJobs: 1,
      failedJobs: 1,
      runningJobs: 1,
      pausedJobs: 1,
      pendingJobs: plan.jobCount - 4,
      completedPercent: Math.round((1 / plan.jobCount) * 1000) / 10,
    });
    const sum = (key: 'total' | 'completed' | 'failed' | 'remaining') =>
      progress.byCountry.reduce((total, country) => total + country[key], 0);
    expect(sum('total')).toBe(plan.jobCount);
    expect(sum('completed')).toBe(1);
    expect(sum('failed')).toBe(1);
    expect(sum('remaining')).toBe(plan.jobCount - 2);
  });
});
