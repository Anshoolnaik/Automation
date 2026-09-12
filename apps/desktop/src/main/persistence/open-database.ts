import { openAtlasDatabase, type AtlasDatabase } from '@atlas/database';
import type { Logger } from '@atlas/logger';

export interface OpenedDatabase {
  database: AtlasDatabase;
  agentRunId: string;
}

/**
 * Opens and migrates the database, recovers from an unclean previous exit,
 * and records the start of this application session.
 */
export function openDatabaseForSession(filePath: string, logger: Logger): OpenedDatabase {
  const database = openAtlasDatabase({ filePath });
  if (database.migrations.applied.length > 0) {
    logger.info('Database migrated', { metadata: { applied: database.migrations.applied } });
  }

  const abortedRuns = database.agentRuns.abortUnfinished();
  const interruptedTasks = database.tasks.failInterrupted(
    'Atlas Agent exited before the task finished',
  );
  if (abortedRuns > 0 || interruptedTasks > 0) {
    logger.warn('Recovered from an unclean shutdown', {
      metadata: { abortedRuns, interruptedTasks },
    });
  }

  const run = database.agentRuns.start();
  logger.debug('Agent run started', { metadata: { agentRunId: run.id, filePath } });
  return { database, agentRunId: run.id };
}
