import type { SearchQueryCandidate } from '../domain/search-query.js';
import { scorePriority } from './priority.js';
import {
  institutionsOf,
  joinQuery,
  primaryTerm,
  quoted,
  type SearchStrategy,
} from './search-strategy.js';

/**
 * `"<institution>" <other keyword>`, e.g. `"University of Toronto" statement of results`.
 * Uses the primary term of each non-primary keyword, highest priority first,
 * at most `maxVariationsPerInstitution` per institution.
 */
export const institutionKeywordVariantStrategy: SearchStrategy = {
  id: 'INSTITUTION_KEYWORD_VARIANT',
  generate(context) {
    const variants = context.keywords.slice(1, 1 + context.maxVariationsPerInstitution);
    const candidates: SearchQueryCandidate[] = [];
    for (const country of context.countries) {
      for (const institution of institutionsOf(context, country)) {
        for (const keyword of variants) {
          candidates.push({
            strategyId: 'INSTITUTION_KEYWORD_VARIANT',
            countryCode: country.code,
            institutionId: institution.id,
            educationLevel: null,
            transcriptKeywordId: keyword.id,
            program: null,
            queryText: joinQuery(quoted(institution.name), primaryTerm(keyword)),
            priority: scorePriority('INSTITUTION_KEYWORD_VARIANT', keyword),
          });
        }
      }
    }
    return candidates;
  },
};
