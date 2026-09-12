import type { BrowserState } from '@atlas/agent-protocol';
import { isBrowserError, type BrowserController } from '@atlas/browser-core';
import { sanitizeErrorMessage, type Logger } from '@atlas/logger';

import { AgentError } from '../errors.js';
import type { BrowserEventRecorder } from '../ports.js';
import { createBrowserStateMachine } from '../state/transitions.js';

export interface BrowserSessionStatus {
  state: BrowserState;
  message?: string;
}

/**
 * Owns the browser lifecycle state machine on top of a BrowserController.
 * Launch/stop calls are serialized so rapid UI clicks cannot race.
 */
export class BrowserSession {
  private readonly machine = createBrowserStateMachine();
  private message: string | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<(status: BrowserSessionStatus) => void>();
  private readonly detachDisconnect: () => void;

  constructor(
    private readonly controller: BrowserController,
    private readonly logger: Logger,
    private readonly events: BrowserEventRecorder,
  ) {
    this.machine.onChange(() => this.emit());
    this.detachDisconnect = controller.onDisconnected(() => this.handleDisconnected());
  }

  get status(): BrowserSessionStatus {
    return this.message === undefined
      ? { state: this.machine.state }
      : { state: this.machine.state, message: this.message };
  }

  onStatusChange(listener: (status: BrowserSessionStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  launch(): Promise<void> {
    return this.enqueue(async () => {
      if (this.machine.is('RUNNING')) return;
      this.setMessage(undefined);
      this.machine.transition('STARTING');
      try {
        await this.controller.launch();
      } catch (error) {
        const reason = isBrowserError(error) ? error.message : sanitizeErrorMessage(error);
        this.setMessage(reason);
        this.machine.transition('ERROR');
        this.events.record({ type: 'BROWSER_LAUNCH_FAILED', details: { reason } });
        throw new AgentError('BROWSER_LAUNCH_FAILED', reason, { cause: error });
      }
      this.machine.transition('RUNNING');
      this.logger.info('Browser launched');
      this.events.record({ type: 'BROWSER_LAUNCHED' });
    });
  }

  stop(): Promise<void> {
    return this.enqueue(async () => {
      if (this.machine.is('STOPPED')) return;
      if (this.machine.is('RUNNING')) {
        await this.controller.close();
        this.logger.info('Browser stopped');
        this.events.record({ type: 'BROWSER_STOPPED' });
      }
      this.setMessage(undefined);
      this.machine.transition('STOPPED');
    });
  }

  /** Returns the controller for task execution, or throws when the browser is not running. */
  requireRunningController(): BrowserController {
    if (!this.machine.is('RUNNING') || !this.controller.isRunning) {
      throw new AgentError(
        'BROWSER_NOT_RUNNING',
        'The Agent Browser is not running. Click "Launch Agent Browser" first.',
      );
    }
    return this.controller;
  }

  dispose(): void {
    this.detachDisconnect();
    this.listeners.clear();
  }

  private handleDisconnected(): void {
    if (!this.machine.canTransition('DISCONNECTED')) return;
    this.message = 'Chrome was closed outside Atlas';
    this.machine.transition('DISCONNECTED');
    this.events.record({ type: 'BROWSER_DISCONNECTED' });
  }

  private setMessage(message: string | undefined): void {
    this.message = message;
  }

  private emit(): void {
    const status = this.status;
    for (const listener of this.listeners) listener(status);
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work, work);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
