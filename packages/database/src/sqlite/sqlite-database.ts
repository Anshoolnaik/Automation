import { mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  DatabaseSync,
  type SQLInputValue,
  type SQLOutputValue,
  type StatementSync,
} from 'node:sqlite';

export type SqlParams = Record<string, SQLInputValue>;
export type SqlRow = Record<string, SQLOutputValue>;

export const IN_MEMORY = ':memory:';

/**
 * Minimal driver abstraction over SQLite. Repositories and migrations depend on
 * this interface only, so the underlying driver (currently Node's built-in
 * `node:sqlite`) can be replaced without touching them.
 */
export interface SqliteDatabase {
  readonly filePath: string;
  exec(sql: string): void;
  run(sql: string, params?: SqlParams): { changes: number };
  get(sql: string, params?: SqlParams): SqlRow | undefined;
  all(sql: string, params?: SqlParams): SqlRow[];
  /** Runs `work` in a transaction; rolls back and rethrows if it throws. */
  transaction<T>(work: () => T): T;
  /** Flushes the write-ahead log into the main database file. */
  checkpoint(): void;
  close(): void;
}

export function openSqliteDatabase(filePath: string): SqliteDatabase {
  const inMemory = filePath === IN_MEMORY;
  if (!inMemory) mkdirSync(path.dirname(filePath), { recursive: true });

  const db = new DatabaseSync(filePath, { enableForeignKeyConstraints: true });
  if (!inMemory) {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
  }
  db.exec('PRAGMA busy_timeout = 5000');

  let open = true;
  // Prepared statements are reused: bulk inserts run the same SQL thousands of times.
  const statements = new Map<string, StatementSync>();
  const prepare = (sql: string): StatementSync => {
    let statement = statements.get(sql);
    if (!statement) {
      statement = db.prepare(sql);
      statements.set(sql, statement);
    }
    return statement;
  };

  return {
    filePath,
    exec: (sql) => db.exec(sql),
    run: (sql, params = {}) => {
      const result = prepare(sql).run(params);
      return { changes: Number(result.changes) };
    },
    get: (sql, params = {}) => prepare(sql).get(params),
    all: (sql, params = {}) => prepare(sql).all(params),
    transaction: (work) => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = work();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        if (db.isTransaction) db.exec('ROLLBACK');
        throw error;
      }
    },
    checkpoint: () => {
      if (!inMemory) db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    },
    close: () => {
      if (!open) return;
      open = false;
      statements.clear();
      db.close();
    },
  };
}
