import { TERMINAL_TASK_STATUSES } from '@atlas/agent-protocol';
import type { Logger } from '@atlas/logger';

import type { AgentStatus, CurrentTask, ExtensionStatus, PageInfo } from './agent-status.js';
import type { BrowserSession } from './browser/browser-session.js';
import { AgentError } from './errors.js';
import type { BrowserEventRecorder, ExtensionChannel, ExtensionConnection } from './ports.js';
import { createAgentStateMachine, createExtensionStateMachine } from './state/transitions.js';
import type { TaskOutcome, TaskRunner } from './tasks/task-runner.js';

export interface AgentServiceDependencies {
  browser: BrowserSession;
  tasks: TaskRunner;
  extension: ExtensionChannel;
  events: BrowserEventRecorder;
  logger: Logger;
}

/**
 * Coordinates the agent's parts and exposes one status stream. It holds no
 * browser, persistence or transport logic of its own.
 */
export class AgentService {
  private readonly agentState = createAgentStateMachine();
  private readonly extensionState = createExtensionStateMachine();
  private extensionDetails: Omit<ExtensionStatus, 'state'> = {};
  private readonly listeners = new Set<(status: AgentStatus) => void>();
  private readonly subscriptions: Array<() => void> = [];
  private accepting = true;

  constructor(private readonly deps: AgentServiceDependencies) {
    this.subscriptions.push(
      deps.browser.onStatusChange(() => this.emit()),
      this.agentState.onChange(() => this.emit()),
      deps.extension.onConnectionChange((connection) => this.handleExtensionConnection(connection)),
      deps.extension.onActivePageChanged((page) => this.handleActivePage(page)),
      deps.tasks.onTaskUpdate((task) => this.handleTaskUpdate(task)),
    );
    this.handleExtensionConnection(deps.extension.connection);
  }

  getStatus(): AgentStatus {
    const browser = this.deps.browser.status;
    const status: AgentStatus = {
      agent: this.agentState.state,
      browser: browser.state,
      extension: { state: this.extensionState.state, ...this.extensionDetails },
    };
    if (browser.message !== undefined) status.browserMessage = browser.message;
    const task = this.deps.tasks.currentTask;
    if (task && !TERMINAL_TASK_STATUSES.has(task.status)) status.currentTask = task;
    return status;
  }

  onStatusChanged(listener: (status: AgentStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  launchBrowser(): Promise<void> {
    this.assertAccepting();
    return this.deps.browser.launch();
  }

  stopBrowser(): Promise<void> {
    return this.deps.browser.stop();
  }

  /** Runs a command. Resolves with the outcome (including FAILED); rejects only if the task could not be started. */
  runTask(command: string): Promise<TaskOutcome> {
    this.assertAccepting();
    return this.deps.tasks.run(command);
  }

  /** First shutdown step: refuse new work and cancel the running task. Idempotent. */
  async stopAcceptingTasks(): Promise<void> {
    if (!this.accepting) return;
    this.accepting = false;
    this.deps.logger.info('Agent is no longer accepting tasks');
    if (this.agentState.canTransition('STOPPED')) this.agentState.transition('STOPPED');
    await this.deps.tasks.stopAcceptingTasks();
  }

  /** Final shutdown step: detach listeners. Call after the browser has been stopped. */
  dispose(): void {
    for (const unsubscribe of this.subscriptions.splice(0)) unsubscribe();
    this.deps.browser.dispose();
    this.listeners.clear();
  }

  private handleTaskUpdate(task: CurrentTask): void {
    if (task.status === 'RUNNING' && this.agentState.canTransition('RUNNING')) {
      this.agentState.transition('RUNNING');
    } else if (task.status === 'FAILED' && this.agentState.canTransition('ERROR')) {
      this.agentState.transition('ERROR');
    } else if (
      (task.status === 'COMPLETED' || task.status === 'CANCELLED') &&
      this.agentState.canTransition('IDLE')
    ) {
      this.agentState.transition('IDLE');
    }
    this.deps.extension.notifyTaskStatus({
      taskId: task.id,
      status: task.status,
      command: task.command,
    });
    this.emit();
  }

  private handleExtensionConnection(connection: ExtensionConnection): void {
    if (connection.state === 'CONNECTED') {
      this.extensionDetails = {
        ...(connection.extensionVersion && { extensionVersion: connection.extensionVersion }),
        ...(connection.connectedAt && { connectedAt: connection.connectedAt }),
      };
    } else {
      this.extensionDetails = {};
    }
    if (connection.state === this.extensionState.state) return;

    this.extensionState.transition(connection.state);
    this.deps.events.record({
      type: connection.state === 'CONNECTED' ? 'EXTENSION_CONNECTED' : 'EXTENSION_DISCONNECTED',
      ...(connection.extensionVersion && {
        details: { extensionVersion: connection.extensionVersion },
      }),
    });
    this.emit();
  }

  private handleActivePage(page: PageInfo): void {
    if (!this.extensionState.is('CONNECTED')) return;
    const previous = this.extensionDetails.activePage;
    if (previous?.url === page.url && previous.title === page.title) return;
    this.extensionDetails = { ...this.extensionDetails, activePage: page };
    this.deps.logger.debug('Active page changed', { metadata: { url: page.url } });
    this.deps.events.record({
      type: 'PAGE_CHANGED',
      url: page.url,
      details: { title: page.title },
    });
    this.emit();
  }

  private assertAccepting(): void {
    if (!this.accepting) {
      throw new AgentError('SHUTTING_DOWN', 'Atlas Agent is shutting down');
    }
  }

  private emit(): void {
    const status = this.getStatus();
    for (const listener of this.listeners) listener(status);
  }
}
