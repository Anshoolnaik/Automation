import { countryBroadStrategy } from './country-broad.strategy.js';
import { countryLevelStrategy } from './country-level.strategy.js';
import { institutionBroadStrategy } from './institution-broad.strategy.js';
import { institutionLevelStrategy } from './institution-level.strategy.js';
import { institutionKeywordVariantStrategy } from './keyword-variant.strategy.js';
import { programSpecificStrategy } from './program-specific.strategy.js';
import type { SearchStrategy } from './search-strategy.js';

/** The standard strategy set, in a fixed order (part of what makes planning deterministic). */
export const DEFAULT_SEARCH_STRATEGIES: readonly SearchStrategy[] = [
  institutionBroadStrategy,
  institutionLevelStrategy,
  programSpecificStrategy,
  countryBroadStrategy,
  countryLevelStrategy,
  institutionKeywordVariantStrategy,
];
