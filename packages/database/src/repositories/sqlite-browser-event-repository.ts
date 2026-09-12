import type { SqlRow } from '../sqlite/sqlite-database.js';
import { clampLimit, timestamp, type RepositoryContext } from './repository-context.js';
import { readJsonObject, readNullableString, readString } from './row-readers.js';
import type {
  BrowserEventRecord,
  BrowserEventRepository,
  CreateBrowserEventInput,
} from './types.js';

export class SqliteBrowserEventRepository implements BrowserEventRepository {
  constructor(private readonly context: RepositoryContext) {}

  create(input: CreateBrowserEventInput): BrowserEventRecord {
    const record: BrowserEventRecord = {
      id: this.context.generateId(),
      taskId: input.taskId ?? null,
      eventType: input.eventType,
      url: input.url ?? null,
      details: input.details ?? {},
      createdAt: timestamp(this.context),
    };
    this.context.db.run(
      `INSERT INTO browser_events (id, task_id, event_type, url, details, created_at)
       VALUES (:id, :taskId, :eventType, :url, :details, :createdAt)`,
      {
        id: record.id,
        taskId: record.taskId,
        eventType: record.eventType,
        url: record.url,
        details: JSON.stringify(record.details),
        createdAt: record.createdAt,
      },
    );
    return record;
  }

  listByTask(taskId: string): BrowserEventRecord[] {
    return this.context.db
      .all('SELECT * FROM browser_events WHERE task_id = :taskId ORDER BY created_at, rowid', {
        taskId,
      })
      .map(toRecord);
  }

  listRecent(limit: number): BrowserEventRecord[] {
    return this.context.db
      .all('SELECT * FROM browser_events ORDER BY created_at DESC, rowid DESC LIMIT :limit', {
        limit: clampLimit(limit),
      })
      .map(toRecord);
  }
}

function toRecord(row: SqlRow): BrowserEventRecord {
  return {
    id: readString(row, 'id'),
    taskId: readNullableString(row, 'task_id'),
    eventType: readString(row, 'event_type'),
    url: readNullableString(row, 'url'),
    details: readJsonObject(row, 'details'),
    createdAt: readString(row, 'created_at'),
  };
}
