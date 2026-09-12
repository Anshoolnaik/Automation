import type { AgentService, AgentStatus, TaskOutcome } from '@atlas/agent-core';

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

/** Adapts the domain AgentService to the IPC-facing facade. */
export function createAgentFacade(service: AgentService): AgentFacade {
  return {
    getStatus: () => toSnapshot(service.getStatus()),
    onStatusChanged: (listener) =>
      service.onStatusChanged((status) => listener(toSnapshot(status))),
    launchBrowser: () => service.launchBrowser(),
    stopBrowser: () => service.stopBrowser(),
    runTask: async (command) => toTaskResult(await service.runTask(command)),
  };
}

export function toSnapshot(status: AgentStatus): AgentStatusSnapshot {
  const snapshot: AgentStatusSnapshot = {
    agent: status.agent,
    browser: status.browser,
    extension: { ...status.extension },
  };
  if (status.browserMessage !== undefined) snapshot.browserMessage = status.browserMessage;
  if (status.currentTask) snapshot.currentTask = { ...status.currentTask };
  return snapshot;
}

export function toTaskResult(outcome: TaskOutcome): TaskRunResultDto {
  const result: TaskRunResultDto = { taskId: outcome.taskId, status: outcome.status };
  if (outcome.errorMessage !== undefined) result.errorMessage = outcome.errorMessage;
  if (outcome.finalUrl !== undefined) result.finalUrl = outcome.finalUrl;
  if (outcome.finalTitle !== undefined) result.finalTitle = outcome.finalTitle;
  return result;
}
