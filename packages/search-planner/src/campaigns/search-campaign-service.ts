import { sanitizeErrorMessage, type Logger } from '@atlas/logger';

import { TRANSCRIPT_SEARCH_VOCABULARY } from '../config/vocabulary.js';
import { SearchError } from '../domain/errors.js';
import type { SearchCampaign } from '../domain/search-campaign.js';
import { parseSearchIntent, type SearchVocabulary } from '../domain/search-intent.js';
import type { SearchJobView } from '../domain/search-job.js';
import { resolveEnabledSources } from '../planner/resolve-sources.js';
import type { SearchPlanner, SearchPlanResult } from '../planner/search-planner.js';
import type {
  SearchCampaignStore,
  SearchJobStore,
  SearchSourceStore,
} from '../ports/search-stores.js';

export interface CreateSearchCampaignInput {
  name: string;
  intent: unknown;
  sourceIds: readonly string[];
}

export interface SearchCampaignServiceDependencies {
  campaigns: SearchCampaignStore;
  sources: SearchSourceStore;
  jobs: Pick<SearchJobStore, 'listJobViews'>;
  planner: Pick<SearchPlanner, 'plan'>;
  logger: Logger;
  vocabulary?: SearchVocabulary;
}

export const MAX_CAMPAIGN_NAME_LENGTH = 200;
export const MAX_JOB_PAGE_SIZE = 200;

/** Errors that describe the request rather than a failed planning run. */
const REQUEST_ERRORS = new Set(['CAMPAIGN_NOT_FOUND', 'INVALID_CAMPAIGN_STATE', 'CAMPAIGN_BUSY']);

/** Application service for creating, planning and inspecting search campaigns. */
export class SearchCampaignService {
  private readonly vocabulary: SearchVocabulary;
  private readonly planning = new Set<string>();

  constructor(private readonly deps: SearchCampaignServiceDependencies) {
    this.vocabulary = deps.vocabulary ?? TRANSCRIPT_SEARCH_VOCABULARY;
  }

  createCampaign(input: CreateSearchCampaignInput): SearchCampaign {
    const name = input.name.replace(/\s+/g, ' ').trim();
    if (!name || name.length > MAX_CAMPAIGN_NAME_LENGTH) {
      throw new SearchError(
        'CAMPAIGN_INVALID',
        `Campaign name must be between 1 and ${MAX_CAMPAIGN_NAME_LENGTH} characters`,
      );
    }
    const intent = parseSearchIntent(input.intent, this.vocabulary);
    const sources = resolveEnabledSources(this.deps.sources, input.sourceIds);
    const campaign = this.deps.campaigns.createCampaign({
      name,
      intent,
      sourceIds: sources.map((source) => source.id),
    });
    this.deps.logger.info(`Search campaign created: ${campaign.name}`, {
      metadata: {
        campaignId: campaign.id,
        countries: intent.countries,
        sources: campaign.sourceIds,
      },
    });
    return campaign;
  }

  /** Plans (or re-plans) a campaign from its stored intent and sources. */
  async planCampaign(campaignId: string): Promise<SearchPlanResult> {
    const campaign = this.getCampaign(campaignId);
    if (this.planning.has(campaignId)) {
      throw new SearchError('CAMPAIGN_BUSY', 'This campaign is already being planned');
    }
    this.planning.add(campaignId);
    try {
      return await this.deps.planner.plan({
        campaignId,
        intent: campaign.intent,
        enabledSourceIds: campaign.sourceIds,
      });
    } catch (error) {
      if (!(error instanceof SearchError && REQUEST_ERRORS.has(error.code))) {
        this.recordPlanningFailure(campaign, error);
      }
      throw error;
    } finally {
      this.planning.delete(campaignId);
    }
  }

  listCampaigns(limit = 50): SearchCampaign[] {
    return this.deps.campaigns.listCampaigns(limit);
  }

  getCampaign(campaignId: string): SearchCampaign {
    const campaign = this.deps.campaigns.findCampaign(campaignId);
    if (!campaign) {
      throw new SearchError('CAMPAIGN_NOT_FOUND', `Search campaign not found: ${campaignId}`);
    }
    return campaign;
  }

  listJobs(campaignId: string, page: { limit: number; offset: number }): SearchJobView[] {
    this.getCampaign(campaignId);
    return this.deps.jobs.listJobViews(campaignId, {
      limit: Math.min(MAX_JOB_PAGE_SIZE, Math.max(1, Math.trunc(page.limit))),
      offset: Math.max(0, Math.trunc(page.offset)),
    });
  }

  private recordPlanningFailure(campaign: SearchCampaign, error: unknown): void {
    const message = sanitizeErrorMessage(error);
    this.deps.logger.error(`Search planning failed for "${campaign.name}": ${message}`, {
      metadata: { campaignId: campaign.id },
    });
    // A never-planned campaign becomes FAILED; an existing plan stays valid and keeps its jobs.
    const failed =
      campaign.status === 'DRAFT' &&
      this.deps.campaigns.transitionCampaign(campaign.id, {
        from: ['DRAFT'],
        to: 'FAILED',
        lastError: message,
      });
    if (!failed) this.deps.campaigns.recordCampaignError(campaign.id, message);
  }
}
