export type AgentErrorCode =
  | 'BROWSER_NOT_RUNNING'
  | 'BROWSER_LAUNCH_FAILED'
  | 'TASK_REJECTED'
  | 'SHUTTING_DOWN'
  | 'COMMAND_NOT_UNDERSTOOD'
  | 'TASK_CANCELLED';

/** Errors the agent reports to its callers (the desktop shell maps `code` to IPC error codes). */
export class AgentError extends Error {
  override readonly name = 'AgentError';

  constructor(
    readonly code: AgentErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
