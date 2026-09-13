import { searchStoresOf, type AtlasDatabase } from '@atlas/database';
import type { LogManager } from '@atlas/logger';
import { StaticInstitutionProvider, createSearchServices } from '@atlas/search-planner';

import { createSearchFacade, type SearchFacade } from './search-facade.js';

export interface SearchRuntime {
  facade: SearchFacade;
}

/**
 * Wires Phase-2 search planning onto the application database. Planning and
 * inspection only: no search job is executed against any website.
 */
export function createSearchRuntime(options: {
  database: AtlasDatabase;
  logs: LogManager;
}): SearchRuntime {
  const stores = searchStoresOf(options.database);
  const services = createSearchServices({
    stores,
    // Phase 2 uses the small development fixture set; real institution import comes later.
    institutionProvider: new StaticInstitutionProvider(),
    logger: options.logs.forComponent('search'),
  });
  // Nothing runs jobs yet, but keep the queue consistent if a future worker was interrupted.
  services.queue.recoverInterruptedJobs();
  return { facade: createSearchFacade(services, stores.sources) };
}
