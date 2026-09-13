import { randomUUID } from 'node:crypto';

import { MIGRATIONS, type Migration } from './migrations/index.js';
import { migrate, type MigrationReport } from './migrator.js';
import type { RepositoryContext } from './repositories/repository-context.js';
import { SqliteAgentRunRepository } from './repositories/sqlite-agent-run-repository.js';
import { SqliteBrowserEventRepository } from './repositories/sqlite-browser-event-repository.js';
import { SqliteCheckpointRepository } from './repositories/sqlite-checkpoint-repository.js';
import { SqliteTaskRepository } from './repositories/sqlite-task-repository.js';
import {
  SqliteInstitutionRepository,
  type InstitutionRepository,
} from './repositories/search/sqlite-institution-repository.js';
import {
  SqliteSearchCampaignRepository,
  type SearchCampaignRepository,
} from './repositories/search/sqlite-search-campaign-repository.js';
import {
  SqliteSearchJobRepository,
  type SearchJobRepository,
} from './repositories/search/sqlite-search-job-repository.js';
import {
  SqliteSearchQueryRepository,
  type SearchQueryRepository,
} from './repositories/search/sqlite-search-query-repository.js';
import {
  SqliteSearchSourceRepository,
  type SearchSourceRepository,
} from './repositories/search/sqlite-search-source-repository.js';
import type {
  AgentRunRepository,
  BrowserEventRepository,
  CheckpointRepository,
  TaskRepository,
} from './repositories/types.js';
import { openSqliteDatabase } from './sqlite/sqlite-database.js';

export interface AtlasDatabase {
  readonly filePath: string;
  readonly migrations: MigrationReport;
  readonly agentRuns: AgentRunRepository;
  readonly tasks: TaskRepository;
  readonly browserEvents: BrowserEventRepository;
  readonly checkpoints: CheckpointRepository;
  readonly searchSources: SearchSourceRepository;
  readonly searchCampaigns: SearchCampaignRepository;
  readonly institutions: InstitutionRepository;
  readonly searchQueries: SearchQueryRepository;
  readonly searchJobs: SearchJobRepository;
  /** Runs `work` in one transaction; every repository write inside it commits or rolls back together. */
  transaction<T>(work: () => T): T;
  /** Checkpoints the WAL into the main file and closes the connection. */
  close(): void;
}

export interface OpenAtlasDatabaseOptions {
  /** Database file path, or ':memory:' for tests. */
  filePath: string;
  now?: () => Date;
  generateId?: () => string;
  migrations?: readonly Migration[];
}

/** Opens (creating if needed) and migrates the Atlas database. */
export function openAtlasDatabase(options: OpenAtlasDatabaseOptions): AtlasDatabase {
  const db = openSqliteDatabase(options.filePath);
  const now = options.now ?? (() => new Date());
  let report: MigrationReport;
  try {
    report = migrate(db, options.migrations ?? MIGRATIONS, now);
  } catch (error) {
    db.close();
    throw error;
  }

  const context: RepositoryContext = { db, now, generateId: options.generateId ?? randomUUID };
  let closed = false;

  return {
    filePath: db.filePath,
    migrations: report,
    agentRuns: new SqliteAgentRunRepository(context),
    tasks: new SqliteTaskRepository(context),
    browserEvents: new SqliteBrowserEventRepository(context),
    checkpoints: new SqliteCheckpointRepository(context),
    searchSources: new SqliteSearchSourceRepository(context),
    searchCampaigns: new SqliteSearchCampaignRepository(context),
    institutions: new SqliteInstitutionRepository(context),
    searchQueries: new SqliteSearchQueryRepository(context),
    searchJobs: new SqliteSearchJobRepository(context),
    transaction: (work) => db.transaction(work),
    close: () => {
      if (closed) return;
      closed = true;
      try {
        db.checkpoint();
      } finally {
        db.close();
      }
    },
  };
}
