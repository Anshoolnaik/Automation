import type { SearchQueryCandidate } from '../domain/search-query.js';
import { scorePriority } from './priority.js';
import { joinQuery, type SearchStrategy } from './search-strategy.js';

/** `<country> <keyword term>` for every selected keyword spelling, e.g. "Canada academic transcript". */
export const countryBroadStrategy: SearchStrategy = {
  id: 'COUNTRY_BROAD',
  generate(context) {
    const candidates: SearchQueryCandidate[] = [];
    for (const country of context.countries) {
      for (const keyword of context.keywords) {
        keyword.terms.forEach((term, termIndex) => {
          candidates.push({
            strategyId: 'COUNTRY_BROAD',
            countryCode: country.code,
            institutionId: null,
            educationLevel: null,
            transcriptKeywordId: keyword.id,
            program: null,
            queryText: joinQuery(country.queryName, term),
            priority: scorePriority('COUNTRY_BROAD', keyword, termIndex),
          });
        });
      }
    }
    return candidates;
  },
};
