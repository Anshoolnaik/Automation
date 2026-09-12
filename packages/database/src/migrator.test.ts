import { afterEach, describe, expect, it } from 'vitest';

import { MIGRATIONS } from './migrations/index.js';
import { MigrationError, migrate } from './migrator.js';
import { IN_MEMORY, openSqliteDatabase, type SqliteDatabase } from './sqlite/sqlite-database.js';

let db: SqliteDatabase;

afterEach(() => {
  db?.close();
});

const tableNames = () =>
  db
    .all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .map((row) => row.name);

describe('migrate', () => {
  it('creates the Phase-1 schema on a fresh database', () => {
    db = openSqliteDatabase(IN_MEMORY);
    const report = migrate(db, MIGRATIONS, () => new Date('2026-09-13T00:00:00Z'));

    expect(report).toEqual({ applied: [1], currentVersion: 1 });
    expect(tableNames()).toEqual([
      'agent_runs',
      'browser_events',
      'checkpoints',
      'schema_migrations',
      'tasks',
    ]);
    expect(db.all('SELECT * FROM schema_migrations')).toEqual([
      { version: 1, name: 'initial_schema', applied_at: '2026-09-13T00:00:00.000Z' },
    ]);
  });

  it('is idempotent', () => {
    db = openSqliteDatabase(IN_MEMORY);
    migrate(db, MIGRATIONS);
    expect(migrate(db, MIGRATIONS).applied).toEqual([]);
  });

  it('applies only pending migrations, in order', () => {
    db = openSqliteDatabase(IN_MEMORY);
    migrate(db, MIGRATIONS);
    const report = migrate(db, [
      ...MIGRATIONS,
      { version: 2, name: 'add_notes', up: 'ALTER TABLE tasks ADD COLUMN notes TEXT' },
    ]);
    expect(report.applied).toEqual([2]);
    expect(db.all('PRAGMA table_info(tasks)').map((c) => c.name)).toContain('notes');
  });

  it('rolls back a failing migration completely', () => {
    db = openSqliteDatabase(IN_MEMORY);
    const broken = [
      { version: 1, name: 'broken', up: 'CREATE TABLE a (id TEXT); CREATE TABLE a (id TEXT);' },
    ];
    expect(() => migrate(db, broken)).toThrow(MigrationError);
    expect(tableNames()).toEqual(['schema_migrations']);
  });

  it('refuses a database written by a newer Atlas version', () => {
    db = openSqliteDatabase(IN_MEMORY);
    migrate(db, [...MIGRATIONS, { version: 2, name: 'future', up: 'SELECT 1' }]);
    expect(() => migrate(db, MIGRATIONS)).toThrow(/newer version of Atlas Agent/);
  });

  it('rejects out-of-order migration lists', () => {
    db = openSqliteDatabase(IN_MEMORY);
    expect(() =>
      migrate(db, [
        { version: 2, name: 'b', up: 'SELECT 1' },
        { version: 1, name: 'a', up: 'SELECT 1' },
      ]),
    ).toThrow(/strictly increasing/);
  });
});
