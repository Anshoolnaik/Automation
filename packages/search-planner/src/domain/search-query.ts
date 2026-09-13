import type { EducationLevel } from './education-level.js';

export const SEARCH_STRATEGY_IDS = [
  'COUNTRY_BROAD',
  'COUNTRY_LEVEL',
  'INSTITUTION_BROAD',
  'INSTITUTION_LEVEL',
  'INSTITUTION_KEYWORD_VARIANT',
  'PROGRAM_SPECIFIC',
] as const;

export type SearchStrategyId = (typeof SEARCH_STRATEGY_IDS)[number];

/** A query proposed by a strategy, before normalization, deduplication and limits. */
export interface SearchQueryCandidate {
  strategyId: SearchStrategyId;
  countryCode: string;
  institutionId: string | null;
  educationLevel: EducationLevel | null;
  transcriptKeywordId: string;
  program: string | null;
  /** Human-readable, source-independent search text. */
  queryText: string;
  priority: number;
}

/** An accepted, normalized and identified query. Not tied to any website. */
export interface SearchQuery extends SearchQueryCandidate {
  id: string;
  campaignId: string;
  normalizedQuery: string;
  /** SHA-256 (hex) of the normalized query. */
  queryHash: string;
}
