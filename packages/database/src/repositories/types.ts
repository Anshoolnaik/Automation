import type { TaskStatus } from '@atlas/agent-protocol';

// ------------------------------------------------------------------ agent_runs

export const AGENT_RUN_STATUSES = ['RUNNING', 'STOPPED', 'ABORTED'] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export interface AgentRunRecord {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: AgentRunStatus;
}

/** One row per application session. */
export interface AgentRunRepository {
  start(): AgentRunRecord;
  stop(id: string): void;
  /** Marks runs left RUNNING by a crash as ABORTED. Returns how many were updated. */
  abortUnfinished(): number;
  findById(id: string): AgentRunRecord | undefined;
}

// ------------------------------------------------------------------ tasks

export interface TaskRecord {
  id: string;
  agentRunId: string | null;
  command: string;
  status: TaskStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface CreateTaskInput {
  command: string;
  agentRunId?: string | null;
}

/**
 * Status changes are guarded in SQL: each method only updates a task that is
 * currently in the expected prior status, and throws otherwise.
 */
export interface TaskRepository {
  create(input: CreateTaskInput): TaskRecord;
  markRunning(id: string): TaskRecord;
  markCompleted(id: string): TaskRecord;
  markFailed(id: string, errorMessage: string): TaskRecord;
  markCancelled(id: string, reason?: string): TaskRecord;
  /** Fails PENDING/RUNNING tasks interrupted by a crash. Returns how many were updated. */
  failInterrupted(message: string): number;
  findById(id: string): TaskRecord | undefined;
  listRecent(limit: number): TaskRecord[];
}

// ------------------------------------------------------------------ browser_events

export interface BrowserEventRecord {
  id: string;
  taskId: string | null;
  eventType: string;
  url: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface CreateBrowserEventInput {
  taskId?: string | null;
  eventType: string;
  url?: string | null;
  details?: Record<string, unknown>;
}

export interface BrowserEventRepository {
  create(input: CreateBrowserEventInput): BrowserEventRecord;
  listByTask(taskId: string): BrowserEventRecord[];
  listRecent(limit: number): BrowserEventRecord[];
}

// ------------------------------------------------------------------ checkpoints

export interface CheckpointRecord {
  id: string;
  taskId: string;
  checkpointType: string;
  data: unknown;
  createdAt: string;
}

export interface CreateCheckpointInput {
  taskId: string;
  checkpointType: string;
  data: unknown;
}

export interface CheckpointRepository {
  create(input: CreateCheckpointInput): CheckpointRecord;
  listByTask(taskId: string): CheckpointRecord[];
}

// ------------------------------------------------------------------ errors

export class RecordStateError extends Error {
  override readonly name = 'RecordStateError';
}
