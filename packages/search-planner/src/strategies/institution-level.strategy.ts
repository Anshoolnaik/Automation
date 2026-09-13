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

/** `"<institution>" <level term> <primary keyword>`, e.g. `"University of Toronto" MSc transcript`. */
export const institutionLevelStrategy: SearchStrategy = {
  id: 'INSTITUTION_LEVEL',
  generate(context) {
    const keyword = primaryKeyword(context);
    const term = primaryTerm(keyword);
    const candidates: SearchQueryCandidate[] = [];
    for (const country of context.countries) {
      for (const institution of institutionsOf(context, country)) {
        for (const level of context.educationLevels) {
          level.queryTerms.forEach((levelTerm, termIndex) => {
            candidates.push({
              strategyId: 'INSTITUTION_LEVEL',
              countryCode: country.code,
              institutionId: institution.id,
              educationLevel: level.level,
              transcriptKeywordId: keyword.id,
              program: null,
              queryText: joinQuery(quoted(institution.name), levelTerm, term),
              priority: scorePriority('INSTITUTION_LEVEL', keyword, termIndex),
            });
          });
        }
      }
    }
    return candidates;
  },
};
