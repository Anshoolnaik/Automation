import type { Logger } from '@atlas/logger';

import { SearchCampaignService } from './campaigns/search-campaign-service.js';
import type { SearchVocabulary } from './domain/search-intent.js';
import type { InstitutionProvider } from './institutions/institution-provider.js';
import { SearchJobQueue } from './jobs/search-job-queue.js';
import { SearchPlanner } from './planner/search-planner.js';
import type { SearchStores } from './ports/search-stores.js';
import { SearchProgressService } from './progress/search-progress-service.js';
import type { PlanningLimits } from './query/planning-limits.js';
import type { SearchStrategy } from './strategies/search-strategy.js';

export interface SearchServicesOptions {
  stores: SearchStores;
  institutionProvider: InstitutionProvider;
  logger: Logger;
  vocabulary?: SearchVocabulary;
  strategies?: readonly SearchStrategy[];
  limits?: Partial<PlanningLimits>;
  maxAttempts?: number;
  now?: () => Date;
}

export interface SearchServices {
  planner: SearchPlanner;
  campaigns: SearchCampaignService;
  queue: SearchJobQueue;
  progress: SearchProgressService;
}

/** Composition helper: wires the search services onto a set of stores. */
export function createSearchServices(options: SearchServicesOptions): SearchServices {
  const { stores, logger } = options;
  const planner = new SearchPlanner({
    ...stores,
    institutionProvider: options.institutionProvider,
    logger: logger.child('planner'),
    ...(options.vocabulary && { vocabulary: options.vocabulary }),
    ...(options.strategies && { strategies: options.strategies }),
    ...(options.limits && { limits: options.limits }),
    ...(options.now && { now: options.now }),
  });
  return {
    planner,
    campaigns: new SearchCampaignService({
      ...stores,
      planner,
      logger: logger.child('campaigns'),
      ...(options.vocabulary && { vocabulary: options.vocabulary }),
    }),
    queue: new SearchJobQueue({
      jobs: stores.jobs,
      logger: logger.child('queue'),
      ...(options.maxAttempts !== undefined && { maxAttempts: options.maxAttempts }),
    }),
    progress: new SearchProgressService({
      progress: stores.progress,
      ...(options.vocabulary && { countries: options.vocabulary.countries }),
    }),
  };
}
