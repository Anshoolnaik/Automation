import type { Logger } from '@atlas/logger';

import type { AgentStatus, ExtensionStatus, PageInfo } from './agent-status.js';
import type { BrowserSession } from './browser/browser-session.js';
import { AgentError } from './errors.js';
import type { BrowserEventRecorder, ExtensionChannel, ExtensionConnection } from './ports.js';
import { createAgentStateMachine, createExtensionStateMachine } from './state/transitions.js';

export interface AgentServiceDependencies {
  browser: BrowserSession;
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

  /** First shutdown step: refuse new work. Idempotent. */
  stopAcceptingTasks(): Promise<void> {
    if (!this.accepting) return Promise.resolve();
    this.accepting = false;
    this.deps.logger.info('Agent is no longer accepting tasks');
    if (this.agentState.canTransition('STOPPED')) this.agentState.transition('STOPPED');
    return Promise.resolve();
  }

  /** Final shutdown step: detach listeners. Call after the browser has been stopped. */
  dispose(): void {
    for (const unsubscribe of this.subscriptions.splice(0)) unsubscribe();
    this.deps.browser.dispose();
    this.listeners.clear();
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
