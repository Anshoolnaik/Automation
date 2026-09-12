import type { SqliteDatabase } from '../sqlite/sqlite-database.js';

/** Shared collaborators injected into every repository. */
export interface RepositoryContext {
  db: SqliteDatabase;
  now: () => Date;
  generateId: () => string;
}

export const timestamp = (context: RepositoryContext): string => context.now().toISOString();

/** Keeps list queries bounded. */
export const clampLimit = (limit: number): number =>
  Math.max(1, Math.min(1_000, Math.trunc(limit) || 1));
