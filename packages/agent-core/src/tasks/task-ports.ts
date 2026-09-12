/**
 * Persistence ports used by the TaskRunner. The SQLite repositories in
 * @atlas/database satisfy these structurally.
 */

export interface TaskStore {
  create(input: { command: string; agentRunId?: string | null }): { id: string };
  markRunning(id: string): unknown;
  markCompleted(id: string): unknown;
  markFailed(id: string, errorMessage: string): unknown;
  markCancelled(id: string, reason?: string): unknown;
}

export interface CheckpointStore {
  create(input: { taskId: string; checkpointType: string; data: unknown }): unknown;
}
