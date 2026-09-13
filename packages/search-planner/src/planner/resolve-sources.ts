import { SearchError } from '../domain/errors.js';
import type { SearchSource } from '../domain/search-source.js';
import type { SearchSourceStore } from '../ports/search-stores.js';

/** Returns the requested sources, sorted by ID, or throws if any is unknown or disabled. */
export function resolveEnabledSources(
  store: SearchSourceStore,
  sourceIds: readonly string[],
): SearchSource[] {
  const unique = [...new Set(sourceIds.map((id) => id.trim()))].filter(Boolean).sort();
  if (unique.length === 0) {
    throw new SearchError('SOURCE_UNAVAILABLE', 'Select at least one search source');
  }
  return unique.map((id) => {
    const source = store.findSource(id);
    if (!source) throw new SearchError('SOURCE_UNAVAILABLE', `Unknown search source: ${id}`);
    if (!source.enabled) {
      throw new SearchError('SOURCE_UNAVAILABLE', `Search source is disabled: ${source.name}`);
    }
    return source;
  });
}
