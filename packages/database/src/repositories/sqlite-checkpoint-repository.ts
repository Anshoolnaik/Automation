import type { SqlRow } from '../sqlite/sqlite-database.js';
import { timestamp, type RepositoryContext } from './repository-context.js';
import { readJson, readString } from './row-readers.js';
import type { CheckpointRecord, CheckpointRepository, CreateCheckpointInput } from './types.js';

export class SqliteCheckpointRepository implements CheckpointRepository {
  constructor(private readonly context: RepositoryContext) {}

  create(input: CreateCheckpointInput): CheckpointRecord {
    const dataJson = JSON.stringify(input.data ?? null);
    const record: CheckpointRecord = {
      id: this.context.generateId(),
      taskId: input.taskId,
      checkpointType: input.checkpointType,
      data: JSON.parse(dataJson) as unknown,
      createdAt: timestamp(this.context),
    };
    this.context.db.run(
      `INSERT INTO checkpoints (id, task_id, checkpoint_type, data_json, created_at)
       VALUES (:id, :taskId, :checkpointType, :dataJson, :createdAt)`,
      {
        id: record.id,
        taskId: record.taskId,
        checkpointType: record.checkpointType,
        dataJson,
        createdAt: record.createdAt,
      },
    );
    return record;
  }

  listByTask(taskId: string): CheckpointRecord[] {
    return this.context.db
      .all('SELECT * FROM checkpoints WHERE task_id = :taskId ORDER BY created_at, rowid', {
        taskId,
      })
      .map(toRecord);
  }
}

function toRecord(row: SqlRow): CheckpointRecord {
  return {
    id: readString(row, 'id'),
    taskId: readString(row, 'task_id'),
    checkpointType: readString(row, 'checkpoint_type'),
    data: readJson(row, 'data_json'),
    createdAt: readString(row, 'created_at'),
  };
}
