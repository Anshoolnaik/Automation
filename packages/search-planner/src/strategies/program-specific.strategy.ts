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

/**
 * Only runs when programs are supplied explicitly:
 * `<country> "<program>" <primary keyword>` and `"<institution>" "<program>" <primary keyword>`.
 */
export const programSpecificStrategy: SearchStrategy = {
  id: 'PROGRAM_SPECIFIC',
  generate(context) {
    if (context.programNames.length === 0) return [];
    const keyword = primaryKeyword(context);
    const term = primaryTerm(keyword);
    const candidates: SearchQueryCandidate[] = [];
    for (const country of context.countries) {
      for (const program of context.programNames) {
        candidates.push({
          strategyId: 'PROGRAM_SPECIFIC',
          countryCode: country.code,
          institutionId: null,
          educationLevel: null,
          transcriptKeywordId: keyword.id,
          program,
          queryText: joinQuery(country.queryName, quoted(program), term),
          priority: scorePriority('COUNTRY_PROGRAM', keyword),
        });
      }
      for (const institution of institutionsOf(context, country)) {
        for (const program of context.programNames) {
          candidates.push({
            strategyId: 'PROGRAM_SPECIFIC',
            countryCode: country.code,
            institutionId: institution.id,
            educationLevel: null,
            transcriptKeywordId: keyword.id,
            program,
            queryText: joinQuery(quoted(institution.name), quoted(program), term),
            priority: scorePriority('INSTITUTION_PROGRAM', keyword),
          });
        }
      }
    }
    return candidates;
  },
};
