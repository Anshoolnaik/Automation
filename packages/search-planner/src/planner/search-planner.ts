import type { Logger } from '@atlas/logger';

import { TRANSCRIPT_SEARCH_VOCABULARY } from '../config/vocabulary.js';
import { SearchError } from '../domain/errors.js';
import type { Institution } from '../domain/institution.js';
import {
  SEARCH_CAMPAIGN_TRANSITIONS,
  canTransitionCampaign,
  type SearchPlanSummary,
} from '../domain/search-campaign.js';
import {
  parseSearchIntent,
  type SearchIntent,
  type SearchVocabulary,
} from '../domain/search-intent.js';
import { sourcesOf } from '../domain/transitions.js';
import type { InstitutionProvider } from '../institutions/institution-provider.js';
import type {
  InstitutionStore,
  NewSearchJob,
  SearchCampaignStore,
  SearchJobStore,
  SearchQueryStore,
  SearchSourceStore,
  SearchUnitOfWork,
} from '../ports/search-stores.js';
import { createJobId } from '../query/normalize-query.js';
import { resolvePlanningLimits, type PlanningLimits } from '../query/planning-limits.js';
import { generateSearchQueries, type PlanningStatistics } from '../query/query-generator.js';
import { DEFAULT_SEARCH_STRATEGIES } from '../strategies/default-strategies.js';
import type { SearchStrategy } from '../strategies/search-strategy.js';
import { buildPlanningContext } from './planning-context.js';
import { resolveEnabledSources } from './resolve-sources.js';

export interface SearchPlanningInput {
  campaignId: string;
  /** Validated and canonicalized before use. */
  intent: unknown;
  enabledSourceIds: readonly string[];
}

export interface SearchPlanResult {
  campaignId: string;
  plannedAt: string;
  countries: string[];
  sourceIds: string[];
  institutionCount: number;
  /** Unique queries in this plan. */
  queryCount: number;
  /** Jobs in this plan (queries × sources). */
  jobCount: number;
  duplicatesRemoved: number;
  jobsByCountry: Record<string, number>;
  /** Rows actually inserted by this run; 0 when re-planning an unchanged campaign. */
  newQueryCount: number;
  newJobCount: number;
  statistics: PlanningStatistics;
}

export interface SearchPlannerDependencies {
  campaigns: SearchCampaignStore;
  sources: SearchSourceStore;
  institutions: InstitutionStore;
  queries: SearchQueryStore;
  jobs: Pick<SearchJobStore, 'insertJobs'>;
  unitOfWork: SearchUnitOfWork;
  institutionProvider: InstitutionProvider;
  logger: Logger;
  vocabulary?: SearchVocabulary;
  strategies?: readonly SearchStrategy[];
  limits?: Partial<PlanningLimits>;
  now?: () => Date;
}

const PLANNABLE_FROM = sourcesOf(SEARCH_CAMPAIGN_TRANSITIONS, 'PLANNED');

/**
 * Turns a campaign's intent into persisted, de-duplicated search queries and
 * source-specific jobs. Deterministic: the same intent, institution data,
 * strategies and limits always produce the same logical queries, and planning
 * again never inserts duplicates.
 */
export class SearchPlanner {
  private readonly vocabulary: SearchVocabulary;
  private readonly strategies: readonly SearchStrategy[];
  private readonly limits: PlanningLimits;
  private readonly now: () => Date;

  constructor(private readonly deps: SearchPlannerDependencies) {
    this.vocabulary = deps.vocabulary ?? TRANSCRIPT_SEARCH_VOCABULARY;
    this.strategies = deps.strategies ?? DEFAULT_SEARCH_STRATEGIES;
    this.limits = resolvePlanningLimits(deps.limits);
    this.now = deps.now ?? (() => new Date());
  }

  async plan(input: SearchPlanningInput): Promise<SearchPlanResult> {
    const { logger } = this.deps;
    const intent = parseSearchIntent(input.intent, this.vocabulary);

    const campaign = this.deps.campaigns.findCampaign(input.campaignId);
    if (!campaign) {
      throw new SearchError('CAMPAIGN_NOT_FOUND', `Search campaign not found: ${input.campaignId}`);
    }
    if (!canTransitionCampaign(campaign.status, 'PLANNED')) {
      throw new SearchError(
        'INVALID_CAMPAIGN_STATE',
        `A ${campaign.status} campaign cannot be planned`,
      );
    }
    const sources = resolveEnabledSources(this.deps.sources, input.enabledSourceIds);
    const sourceIds = sources.map((source) => source.id);

    const context = buildPlanningContext({
      campaignId: campaign.id,
      intent,
      vocabulary: this.vocabulary,
      institutions: await this.loadInstitutions(intent),
    });
    const generated = generateSearchQueries(context, this.strategies, this.limits);
    const { queries, statistics } = generated;

    if (statistics.limitReached) {
      logger.warn(
        `Planning limits discarded ${statistics.discardedByLimit} of ${statistics.deduplicatedCandidates} unique queries`,
        {
          metadata: {
            campaignId: campaign.id,
            discardedByReason: statistics.discardedByReason,
            limits: this.limits,
          },
        },
      );
    }

    const institutions = [...context.institutionsByCountry.values()].flat();
    const jobs: NewSearchJob[] = queries.flatMap((query) =>
      sourceIds.map((sourceId) => ({
        id: createJobId(campaign.id, sourceId, query.queryHash),
        campaignId: campaign.id,
        queryId: query.id,
        sourceId,
        countryCode: query.countryCode,
        institutionId: query.institutionId,
        priority: query.priority,
      })),
    );

    const jobsByCountry: Record<string, number> = {};
    for (const country of context.countries) jobsByCountry[country.code] = 0;
    for (const query of queries) {
      jobsByCountry[query.countryCode] = (jobsByCountry[query.countryCode] ?? 0) + sourceIds.length;
    }

    const plannedAt = this.now().toISOString();
    const { newQueryCount, newJobCount } = this.persist({
      campaignId: campaign.id,
      intent,
      sourceIds,
      institutions,
      queries,
      jobs,
      summary: (counts) => ({
        plannedAt,
        countryCount: intent.countries.length,
        institutionCount: institutions.length,
        queryCount: queries.length,
        jobCount: jobs.length,
        duplicatesRemoved: statistics.duplicatesRemoved,
        newQueryCount: counts.newQueryCount,
        newJobCount: counts.newJobCount,
        discardedByLimit: statistics.discardedByLimit,
        jobsByCountry,
      }),
    });

    logger.info(
      `Search plan generated for "${campaign.name}": ${intent.countries.length} countries, ` +
        `${institutions.length} institutions, ${queries.length} queries, ${jobs.length} jobs ` +
        `(${statistics.duplicatesRemoved} duplicates removed, ${newJobCount} new jobs)`,
      { metadata: { campaignId: campaign.id, statistics } },
    );

    return {
      campaignId: campaign.id,
      plannedAt,
      countries: [...intent.countries],
      sourceIds,
      institutionCount: institutions.length,
      queryCount: queries.length,
      jobCount: jobs.length,
      duplicatesRemoved: statistics.duplicatesRemoved,
      jobsByCountry,
      newQueryCount,
      newJobCount,
      statistics,
    };
  }

  private async loadInstitutions(intent: SearchIntent): Promise<Institution[]> {
    if (!intent.includeInstitutions) return [];
    const institutions: Institution[] = [];
    // Sequential and in canonical country order, so providers see a deterministic call pattern.
    for (const countryCode of intent.countries) {
      institutions.push(...(await this.deps.institutionProvider.getInstitutions(countryCode)));
    }
    return institutions;
  }

  /** Writes everything in one transaction: a failure leaves no partial plan behind. */
  private persist(plan: {
    campaignId: string;
    intent: SearchIntent;
    sourceIds: string[];
    institutions: Institution[];
    queries: Parameters<SearchQueryStore['insertQueries']>[0];
    jobs: NewSearchJob[];
    summary: (counts: { newQueryCount: number; newJobCount: number }) => SearchPlanSummary;
  }): { newQueryCount: number; newJobCount: number } {
    return this.deps.unitOfWork.transaction(() => {
      this.deps.institutions.upsertInstitutions(plan.institutions);
      const newQueryCount = this.deps.queries.insertQueries(plan.queries);
      const newJobCount = this.deps.jobs.insertJobs(plan.jobs);
      const updated = this.deps.campaigns.transitionCampaign(plan.campaignId, {
        from: PLANNABLE_FROM,
        to: 'PLANNED',
        markPlanned: true,
        intent: plan.intent,
        sourceIds: plan.sourceIds,
        planSummary: plan.summary({ newQueryCount, newJobCount }),
        lastError: null,
      });
      if (!updated) {
        throw new SearchError(
          'INVALID_CAMPAIGN_STATE',
          'The campaign changed state while it was being planned',
        );
      }
      return { newQueryCount, newJobCount };
    });
  }
}
