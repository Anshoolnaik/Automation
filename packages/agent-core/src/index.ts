export { AgentService, type AgentServiceDependencies } from './agent-service.js';
export type { AgentStatus, CurrentTask, ExtensionStatus, PageInfo } from './agent-status.js';
export { BrowserSession, type BrowserSessionStatus } from './browser/browser-session.js';
export { AgentError, type AgentErrorCode } from './errors.js';
export {
  noopBrowserEventRecorder,
  type BrowserEventInput,
  type BrowserEventRecorder,
  type BrowserEventType,
} from './ports.js';
export {
  InvalidStateTransitionError,
  StateMachine,
  isTerminal,
  type StateChangeListener,
  type TransitionTable,
} from './state/state-machine.js';
export {
  AGENT_TRANSITIONS,
  BROWSER_TRANSITIONS,
  EXTENSION_TRANSITIONS,
  TASK_TRANSITIONS,
  createAgentStateMachine,
  createBrowserStateMachine,
  createExtensionStateMachine,
  createTaskStateMachine,
} from './state/transitions.js';
