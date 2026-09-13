import type { SearchQueryCandidate } from '../domain/search-query.js';
import { scorePriority } from './priority.js';
import {
  institutionsOf,
  joinQuery,
  primaryKeyword,
  primaryTerm,
  quoted,
  type SearchStrategy,
} from './search-strategy.js';

/** `"<institution>" <primary keyword>`, e.g. `"University of Toronto" transcript`. */
export const institutionBroadStrategy: SearchStrategy = {
  id: 'INSTITUTION_BROAD',
  generate(context) {
    const keyword = primaryKeyword(context);
    const term = primaryTerm(keyword);
    const candidates: SearchQueryCandidate[] = [];
    for (const country of context.countries) {
      for (const institution of institutionsOf(context, country)) {
        candidates.push({
          strategyId: 'INSTITUTION_BROAD',
          countryCode: country.code,
          institutionId: institution.id,
          educationLevel: null,
          transcriptKeywordId: keyword.id,
          program: null,
          queryText: joinQuery(quoted(institution.name), term),
          priority: scorePriority('INSTITUTION_BROAD', keyword),
        });
      }
    }
    return candidates;
  },
};
