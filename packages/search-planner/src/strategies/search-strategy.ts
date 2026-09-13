import type { CountryDefinition } from '../domain/country.js';
import type { EducationLevelDefinition } from '../domain/education-level.js';
import type { Institution } from '../domain/institution.js';
import type { SearchQueryCandidate, SearchStrategyId } from '../domain/search-query.js';
import type { TranscriptKeyword } from '../domain/transcript-keyword.js';

/** Everything a strategy may use, already validated and in canonical order. */
export interface SearchPlanningContext {
  campaignId: string;
  countries: readonly CountryDefinition[];
  educationLevels: readonly EducationLevelDefinition[];
  /** Selected keywords, highest priority first. The first one is the primary keyword. */
  keywords: readonly TranscriptKeyword[];
  /** Institutions per country code, sorted by normalized name. */
  institutionsByCountry: ReadonlyMap<string, readonly Institution[]>;
  includeInstitutions: boolean;
  programNames: readonly string[];
  maxVariationsPerInstitution: number;
}

/** Generates query candidates of one kind. Must be pure and deterministic. */
export interface SearchStrategy {
  readonly id: SearchStrategyId;
  generate(context: SearchPlanningContext): SearchQueryCandidate[];
}

export function primaryKeyword(context: SearchPlanningContext): TranscriptKeyword {
  const keyword = context.keywords[0];
  if (!keyword) throw new Error('A planning context needs at least one keyword');
  return keyword;
}

export function primaryTerm(keyword: TranscriptKeyword): string {
  const term = keyword.terms[0];
  if (!term) throw new Error(`Keyword ${keyword.id} has no terms`);
  return term;
}

export function institutionsOf(
  context: SearchPlanningContext,
  country: CountryDefinition,
): readonly Institution[] {
  return context.includeInstitutions ? (context.institutionsByCountry.get(country.code) ?? []) : [];
}

/** Wraps a name in double quotes (exact-phrase intent), removing quotes inside it. */
export function quoted(value: string): string {
  return `"${value.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim()}"`;
}

export function joinQuery(...parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}
