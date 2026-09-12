import { TASK_STATUSES, type TaskStatus } from '@atlas/agent-protocol';

import type { SqlParams, SqlRow } from '../sqlite/sqlite-database.js';
import { clampLimit, timestamp, type RepositoryContext } from './repository-context.js';
import { readEnum, readNullableString, readString } from './row-readers.js';
import {
  RecordStateError,
  type CreateTaskInput,
  type TaskRecord,
  type TaskRepository,
} from './types.js';

export class SqliteTaskRepository implements TaskRepository {
  constructor(private readonly context: RepositoryContext) {}

  create(input: CreateTaskInput): TaskRecord {
    const id = this.context.generateId();
    this.context.db.run(
      `INSERT INTO tasks (id, agent_run_id, command, status, created_at)
       VALUES (:id, :agentRunId, :command, 'PENDING', :createdAt)`,
      {
        id,
        agentRunId: input.agentRunId ?? null,
        command: input.command,
        createdAt: timestamp(this.context),
      },
    );
    return this.require(id);
  }

  markRunning(id: string): TaskRecord {
    return this.transition(id, ['PENDING'], 'RUNNING', 'started_at = :now');
  }

  markCompleted(id: string): TaskRecord {
    return this.transition(id, ['RUNNING'], 'COMPLETED', 'completed_at = :now');
  }

  markFailed(id: string, errorMessage: string): TaskRecord {
    return this.transition(
      id,
      ['PENDING', 'RUNNING'],
      'FAILED',
      'completed_at = :now, error_message = :errorMessage',
      { errorMessage },
    );
  }

  markCancelled(id: string, reason?: string): TaskRecord {
    return this.transition(
      id,
      ['PENDING', 'RUNNING'],
      'CANCELLED',
      'completed_at = :now, error_message = :errorMessage',
      { errorMessage: reason ?? null },
    );
  }

  failInterrupted(message: string): number {
    return this.context.db.run(
      `UPDATE tasks SET status = 'FAILED', completed_at = :now, error_message = :message
       WHERE status IN ('PENDING', 'RUNNING')`,
      { now: timestamp(this.context), message },
    ).changes;
  }

  findById(id: string): TaskRecord | undefined {
    const row = this.context.db.get('SELECT * FROM tasks WHERE id = :id', { id });
    return row ? toRecord(row) : undefined;
  }

  listRecent(limit: number): TaskRecord[] {
    return this.context.db
      .all('SELECT * FROM tasks ORDER BY created_at DESC, rowid DESC LIMIT :limit', {
        limit: clampLimit(limit),
      })
      .map(toRecord);
  }

  private transition(
    id: string,
    from: readonly TaskStatus[],
    to: TaskStatus,
    assignments: string,
    extra: SqlParams = {},
  ): TaskRecord {
    const fromList = from.map((status) => `'${status}'`).join(', ');
    const { changes } = this.context.db.run(
      `UPDATE tasks SET status = :to, ${assignments}
       WHERE id = :id AND status IN (${fromList})`,
      { id, to, now: timestamp(this.context), ...extra },
    );
    if (changes === 0) {
      const current = this.findById(id);
      throw new RecordStateError(
        current
          ? `Task ${id} cannot move from ${current.status} to ${to}`
          : `Task ${id} does not exist`,
      );
    }
    return this.require(id);
  }

  private require(id: string): TaskRecord {
    const record = this.findById(id);
    if (!record) throw new RecordStateError(`Task ${id} does not exist`);
    return record;
  }
}

function toRecord(row: SqlRow): TaskRecord {
  return {
    id: readString(row, 'id'),
    agentRunId: readNullableString(row, 'agent_run_id'),
    command: readString(row, 'command'),
    status: readEnum(row, 'status', TASK_STATUSES),
    createdAt: readString(row, 'created_at'),
    startedAt: readNullableString(row, 'started_at'),
    completedAt: readNullableString(row, 'completed_at'),
    errorMessage: readNullableString(row, 'error_message'),
  };
}
