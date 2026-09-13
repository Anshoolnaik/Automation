import type { SearchQuery, SearchQueryCandidate } from '../domain/search-query.js';
import type { SearchPlanningContext, SearchStrategy } from '../strategies/search-strategy.js';
import { createQueryId, queryIdentity, type QueryIdentity } from './normalize-query.js';
import type { PlanningLimits } from './planning-limits.js';

export interface LimitDiscards {
  maxQueriesPerInstitution: number;
  maxQueriesPerCountry: number;
  maxTotalQueries: number;
}

export interface PlanningStatistics {
  /** Candidates produced by all strategies. */
  generatedCandidates: number;
  /** Candidates left after removing equivalent (same normalized text) queries. */
  deduplicatedCandidates: number;
  duplicatesRemoved: number;
  acceptedQueries: number;
  /** Unique candidates rejected because a planning limit was reached. Never silent. */
  discardedByLimit: number;
  discardedByReason: LimitDiscards;
  limitReached: boolean;
  limits: PlanningLimits;
}

export interface GeneratedQueries {
  queries: SearchQuery[];
  statistics: PlanningStatistics;
}

interface Ranked {
  candidate: SearchQueryCandidate;
  identity: QueryIdentity;
  countryOrder: number;
  institutionOrder: number;
}

/**
 * Runs strategies, normalizes and de-duplicates their candidates, applies
 * planning limits by priority and assigns deterministic IDs. Pure: the same
 * context, strategies and limits always yield the same result.
 */
export function generateSearchQueries(
  context: SearchPlanningContext,
  strategies: readonly SearchStrategy[],
  limits: PlanningLimits,
): GeneratedQueries {
  const countryOrder = new Map(context.countries.map((country, index) => [country.code, index]));
  const institutionOrder = new Map<string, number>();
  for (const institutions of context.institutionsByCountry.values()) {
    institutions.forEach((institution, index) => institutionOrder.set(institution.id, index));
  }

  let generatedCandidates = 0;
  const unique = new Map<string, Ranked>();
  for (const strategy of strategies) {
    for (const candidate of strategy.generate(context)) {
      generatedCandidates += 1;
      const identity = queryIdentity(candidate.queryText);
      if (!identity.normalizedQuery) continue;
      const existing = unique.get(identity.queryHash);
      // Equivalent queries collapse into one; the more valuable candidate wins.
      if (!existing || candidate.priority > existing.candidate.priority) {
        unique.set(identity.queryHash, {
          candidate,
          identity,
          countryOrder: countryOrder.get(candidate.countryCode) ?? Number.MAX_SAFE_INTEGER,
          institutionOrder:
            candidate.institutionId === null
              ? -1
              : (institutionOrder.get(candidate.institutionId) ?? 0),
        });
      }
    }
  }

  const ranked = [...unique.values()].sort(compareRanked);
  const discardedByReason: LimitDiscards = {
    maxQueriesPerInstitution: 0,
    maxQueriesPerCountry: 0,
    maxTotalQueries: 0,
  };
  const perCountry = new Map<string, number>();
  const perInstitution = new Map<string, number>();
  const queries: SearchQuery[] = [];

  for (const { candidate, identity } of ranked) {
    const countryCount = perCountry.get(candidate.countryCode) ?? 0;
    const institutionCount =
      candidate.institutionId === null ? 0 : (perInstitution.get(candidate.institutionId) ?? 0);

    if (queries.length >= limits.maxTotalQueries) {
      discardedByReason.maxTotalQueries += 1;
    } else if (countryCount >= limits.maxQueriesPerCountry) {
      discardedByReason.maxQueriesPerCountry += 1;
    } else if (
      candidate.institutionId !== null &&
      institutionCount >= limits.maxQueriesPerInstitution
    ) {
      discardedByReason.maxQueriesPerInstitution += 1;
    } else {
      perCountry.set(candidate.countryCode, countryCount + 1);
      if (candidate.institutionId !== null) {
        perInstitution.set(candidate.institutionId, institutionCount + 1);
      }
      queries.push({
        ...candidate,
        id: createQueryId(context.campaignId, identity.queryHash),
        campaignId: context.campaignId,
        normalizedQuery: identity.normalizedQuery,
        queryHash: identity.queryHash,
      });
    }
  }

  const discardedByLimit =
    discardedByReason.maxQueriesPerInstitution +
    discardedByReason.maxQueriesPerCountry +
    discardedByReason.maxTotalQueries;

  return {
    queries,
    statistics: {
      generatedCandidates,
      deduplicatedCandidates: unique.size,
      duplicatesRemoved: generatedCandidates - unique.size,
      acceptedQueries: queries.length,
      discardedByLimit,
      discardedByReason,
      limitReached: discardedByLimit > 0,
      limits: { ...limits },
    },
  };
}

/** Total order: priority, then country, then institution, then normalized text. */
function compareRanked(a: Ranked, b: Ranked): number {
  return (
    b.candidate.priority - a.candidate.priority ||
    a.countryOrder - b.countryOrder ||
    a.institutionOrder - b.institutionOrder ||
    (a.identity.normalizedQuery < b.identity.normalizedQuery ? -1 : 1)
  );
}
