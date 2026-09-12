import type { SqlRow } from '../sqlite/sqlite-database.js';
import { timestamp, type RepositoryContext } from './repository-context.js';
import { readEnum, readNullableString, readString } from './row-readers.js';
import {
  AGENT_RUN_STATUSES,
  RecordStateError,
  type AgentRunRecord,
  type AgentRunRepository,
} from './types.js';

export class SqliteAgentRunRepository implements AgentRunRepository {
  constructor(private readonly context: RepositoryContext) {}

  start(): AgentRunRecord {
    const record: AgentRunRecord = {
      id: this.context.generateId(),
      startedAt: timestamp(this.context),
      endedAt: null,
      status: 'RUNNING',
    };
    this.context.db.run(
      `INSERT INTO agent_runs (id, started_at, ended_at, status)
       VALUES (:id, :startedAt, NULL, 'RUNNING')`,
      { id: record.id, startedAt: record.startedAt },
    );
    return record;
  }

  stop(id: string): void {
    const { changes } = this.context.db.run(
      `UPDATE agent_runs SET status = 'STOPPED', ended_at = :endedAt
       WHERE id = :id AND status = 'RUNNING'`,
      { id, endedAt: timestamp(this.context) },
    );
    if (changes === 0) throw new RecordStateError(`Agent run ${id} is not running`);
  }

  abortUnfinished(): number {
    return this.context.db.run(
      `UPDATE agent_runs SET status = 'ABORTED', ended_at = :endedAt WHERE status = 'RUNNING'`,
      { endedAt: timestamp(this.context) },
    ).changes;
  }

  findById(id: string): AgentRunRecord | undefined {
    const row = this.context.db.get('SELECT * FROM agent_runs WHERE id = :id', { id });
    return row ? toRecord(row) : undefined;
  }
}

function toRecord(row: SqlRow): AgentRunRecord {
  return {
    id: readString(row, 'id'),
    startedAt: readString(row, 'started_at'),
    endedAt: readNullableString(row, 'ended_at'),
    status: readEnum(row, 'status', AGENT_RUN_STATUSES),
  };
}
