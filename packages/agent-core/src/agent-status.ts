import type { AgentState, BrowserState, ExtensionState, TaskStatus } from '@atlas/agent-protocol';

export interface PageInfo {
  title: string;
  url: string;
}

export interface ExtensionStatus {
  state: ExtensionState;
  extensionVersion?: string;
  connectedAt?: string;
  activePage?: PageInfo;
}

export interface CurrentTask {
  id: string;
  command: string;
  status: TaskStatus;
}

/** A complete, immutable picture of the agent, emitted whenever anything changes. */
export interface AgentStatus {
  agent: AgentState;
  browser: BrowserState;
  browserMessage?: string;
  extension: ExtensionStatus;
  currentTask?: CurrentTask;
}
