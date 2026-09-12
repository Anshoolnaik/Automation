import type { AgentState, BrowserState, ExtensionState, TaskStatus } from '@atlas/agent-protocol';

import { StateMachine, type TransitionTable } from './state-machine.js';

/**
 * IDLE: ready for work. RUNNING: a task is executing. ERROR: the last task failed
 * (the agent can still run new tasks). STOPPED: the application is shutting down.
 */
export const AGENT_TRANSITIONS: TransitionTable<AgentState> = {
  IDLE: ['RUNNING', 'STOPPED'],
  RUNNING: ['IDLE', 'ERROR', 'STOPPED'],
  ERROR: ['RUNNING', 'IDLE', 'STOPPED'],
  STOPPED: [],
};

export const BROWSER_TRANSITIONS: TransitionTable<BrowserState> = {
  STOPPED: ['STARTING'],
  STARTING: ['RUNNING', 'ERROR'],
  RUNNING: ['STOPPED', 'DISCONNECTED'],
  DISCONNECTED: ['STARTING', 'STOPPED'],
  ERROR: ['STARTING', 'STOPPED'],
};

export const EXTENSION_TRANSITIONS: TransitionTable<ExtensionState> = {
  DISCONNECTED: ['CONNECTED'],
  CONNECTED: ['DISCONNECTED'],
};

export const TASK_TRANSITIONS: TransitionTable<TaskStatus> = {
  PENDING: ['RUNNING', 'FAILED', 'CANCELLED'],
  RUNNING: ['COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export const createAgentStateMachine = () =>
  new StateMachine<AgentState>('agent', 'IDLE', AGENT_TRANSITIONS);
export const createBrowserStateMachine = () =>
  new StateMachine<BrowserState>('browser', 'STOPPED', BROWSER_TRANSITIONS);
export const createExtensionStateMachine = () =>
  new StateMachine<ExtensionState>('extension', 'DISCONNECTED', EXTENSION_TRANSITIONS);
export const createTaskStateMachine = () =>
  new StateMachine<TaskStatus>('task', 'PENDING', TASK_TRANSITIONS);
