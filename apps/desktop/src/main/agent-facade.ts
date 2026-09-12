import type { AgentStatusSnapshot, TaskRunResultDto, Unsubscribe } from '../shared/ipc-types.js';

/**
 * What the Electron shell needs from the agent. The IPC layer depends only on
 * this interface, never on Playwright, SQLite or WebSocket details.
 */
export interface AgentFacade {
  getStatus(): AgentStatusSnapshot;
  onStatusChanged(listener: (snapshot: AgentStatusSnapshot) => void): Unsubscribe;
  launchBrowser(): Promise<void>;
  stopBrowser(): Promise<void>;
  runTask(command: string): Promise<TaskRunResultDto>;
}
