import type { SearchSource, SearchSourceStore } from '@atlas/search-planner';

import type { SqlRow } from '../../sqlite/sqlite-database.js';
import { timestamp, type RepositoryContext } from '../repository-context.js';
import { readBoolean, readString } from '../row-readers.js';

export interface SearchSourceRepository extends SearchSourceStore {
  /** Adds or updates a source configuration. New sources need no schema change. */
  saveSource(source: SearchSource): SearchSource;
  setSourceEnabled(id: string, enabled: boolean): boolean;
}

export class SqliteSearchSourceRepository implements SearchSourceRepository {
  constructor(private readonly context: RepositoryContext) {}

  listSources(): SearchSource[] {
    return this.context.db.all('SELECT * FROM search_sources ORDER BY name, id').map(toSource);
  }

  findSource(id: string): SearchSource | undefined {
    const row = this.context.db.get('SELECT * FROM search_sources WHERE id = :id', { id });
    return row ? toSource(row) : undefined;
  }

  saveSource(source: SearchSource): SearchSource {
    this.context.db.run(
      `INSERT INTO search_sources (id, name, base_url, enabled, created_at)
       VALUES (:id, :name, :baseUrl, :enabled, :createdAt)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name, base_url = excluded.base_url, enabled = excluded.enabled`,
      {
        id: source.id,
        name: source.name,
        baseUrl: source.baseUrl,
        enabled: source.enabled ? 1 : 0,
        createdAt: timestamp(this.context),
      },
    );
    return source;
  }

  setSourceEnabled(id: string, enabled: boolean): boolean {
    return (
      this.context.db.run('UPDATE search_sources SET enabled = :enabled WHERE id = :id', {
        id,
        enabled: enabled ? 1 : 0,
      }).changes > 0
    );
  }
}

function toSource(row: SqlRow): SearchSource {
  return {
    id: readString(row, 'id'),
    name: readString(row, 'name'),
    baseUrl: readString(row, 'base_url'),
    enabled: readBoolean(row, 'enabled'),
  };
}
