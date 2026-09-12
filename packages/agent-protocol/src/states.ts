import { z } from 'zod';

/**
 * Explicit state vocabulary shared by the desktop app, its UI and the extension.
 * Transition rules live in @atlas/agent-core; this module only names the states.
 */

export const AGENT_STATES = ['IDLE', 'RUNNING', 'STOPPED', 'ERROR'] as const;
export const AgentStateSchema = z.enum(AGENT_STATES);
export type AgentState = z.infer<typeof AgentStateSchema>;

/**
 * DISCONNECTED means the browser went away without Atlas asking it to
 * (e.g. the user closed the Chrome window). ERROR means launching failed.
 */
export const BROWSER_STATES = ['STOPPED', 'STARTING', 'RUNNING', 'DISCONNECTED', 'ERROR'] as const;
export const BrowserStateSchema = z.enum(BROWSER_STATES);
export type BrowserState = z.infer<typeof BrowserStateSchema>;

export const EXTENSION_STATES = ['DISCONNECTED', 'CONNECTED'] as const;
export const ExtensionStateSchema = z.enum(EXTENSION_STATES);
export type ExtensionState = z.infer<typeof ExtensionStateSchema>;

export const TASK_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TERMINAL_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
