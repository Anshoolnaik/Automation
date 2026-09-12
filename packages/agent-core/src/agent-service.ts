import type { Logger } from '@atlas/logger';

import type { AgentStatus, ExtensionStatus } from './agent-status.js';
import type { BrowserSession } from './browser/browser-session.js';
import { AgentError } from './errors.js';
import { createAgentStateMachine } from './state/transitions.js';

export interface AgentServiceDependencies {
  browser: BrowserSession;
  logger: Logger;
}

/**
 * Coordinates the agent's parts and exposes one status stream. It holds no
 * browser, persistence or transport logic of its own.
 */
export class AgentService {
  private readonly agentState = createAgentStateMachine();
  private readonly extension: ExtensionStatus = { state: 'DISCONNECTED' };
  private readonly listeners = new Set<(status: AgentStatus) => void>();
  private readonly subscriptions: Array<() => void> = [];
  private accepting = true;

  constructor(private readonly deps: AgentServiceDependencies) {
    this.subscriptions.push(
      deps.browser.onStatusChange(() => this.emit()),
      this.agentState.onChange(() => this.emit()),
    );
  }

  getStatus(): AgentStatus {
    const browser = this.deps.browser.status;
    const status: AgentStatus = {
      agent: this.agentState.state,
      browser: browser.state,
      extension: { ...this.extension },
    };
    if (browser.message !== undefined) status.browserMessage = browser.message;
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

  /** Stops accepting work and closes the browser. The Chrome profile is left intact. */
  async shutdown(): Promise<void> {
    if (!this.accepting) return;
    this.accepting = false;
    this.deps.logger.info('Agent is no longer accepting tasks');
    await this.deps.browser.stop();
    if (this.agentState.canTransition('STOPPED')) this.agentState.transition('STOPPED');
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.deps.browser.dispose();
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
