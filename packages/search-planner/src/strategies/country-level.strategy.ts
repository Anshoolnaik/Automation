import type { SearchQueryCandidate } from '../domain/search-query.js';
import { scorePriority } from './priority.js';
import { joinQuery, primaryKeyword, primaryTerm, type SearchStrategy } from './search-strategy.js';

/** `<country> <level term> <primary keyword>`, e.g. "Canada diploma transcript". */
export const countryLevelStrategy: SearchStrategy = {
  id: 'COUNTRY_LEVEL',
  generate(context) {
    const keyword = primaryKeyword(context);
    const term = primaryTerm(keyword);
    const candidates: SearchQueryCandidate[] = [];
    for (const country of context.countries) {
      for (const level of context.educationLevels) {
        level.queryTerms.forEach((levelTerm, termIndex) => {
          candidates.push({
            strategyId: 'COUNTRY_LEVEL',
            countryCode: country.code,
            institutionId: null,
            educationLevel: level.level,
            transcriptKeywordId: keyword.id,
            program: null,
            queryText: joinQuery(country.queryName, levelTerm, term),
            priority: scorePriority('COUNTRY_LEVEL', keyword, termIndex),
          });
        });
      }
    }
    return candidates;
  },
};
