import type { Migration } from './migrations/migration.js';
import type { SqliteDatabase } from './sqlite/sqlite-database.js';

export class MigrationError extends Error {
  override readonly name = 'MigrationError';
}

export interface MigrationReport {
  applied: number[];
  currentVersion: number;
}

/**
 * Applies pending migrations in order, each in its own transaction, and records
 * them in `schema_migrations`. Refuses to run against a database created by a
 * newer Atlas version.
 */
export function migrate(
  db: SqliteDatabase,
  migrations: readonly Migration[],
  now: () => Date = () => new Date(),
): MigrationReport {
  validateMigrations(migrations);
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version     INTEGER PRIMARY KEY,
       name        TEXT NOT NULL,
       applied_at  TEXT NOT NULL
     )`,
  );

  const appliedVersions = new Set(
    db.all('SELECT version FROM schema_migrations').map((row) => Number(row.version)),
  );
  const knownVersions = new Set(migrations.map((migration) => migration.version));
  const unknown = [...appliedVersions].filter((version) => !knownVersions.has(version));
  if (unknown.length > 0) {
    throw new MigrationError(
      `The database was created by a newer version of Atlas Agent (unknown schema versions: ${unknown.join(', ')}).`,
    );
  }

  const applied: number[] = [];
  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;
    try {
      db.transaction(() => {
        db.exec(migration.up);
        db.run(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (:version, :name, :appliedAt)',
          { version: migration.version, name: migration.name, appliedAt: now().toISOString() },
        );
      });
    } catch (error) {
      throw new MigrationError(
        `Migration ${migration.version} (${migration.name}) failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    applied.push(migration.version);
  }

  const last = migrations.at(-1);
  return { applied, currentVersion: last ? last.version : 0 };
}

function validateMigrations(migrations: readonly Migration[]): void {
  let previous = 0;
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= previous) {
      throw new MigrationError(
        `Migrations must have strictly increasing positive integer versions (found ${migration.version} after ${previous})`,
      );
    }
    previous = migration.version;
  }
}
