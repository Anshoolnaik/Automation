import {
  createExtensionMessage,
  parseDesktopMessage,
  serializeMessage,
  type DesktopToExtensionMessage,
  type ExtensionToDesktopMessage,
} from '@atlas/agent-protocol';

import type { ConnectionStatus } from '../shared/runtime-messages.js';

/** The subset of the browser WebSocket API used here (injectable for tests). */
export type WebSocketLike = Pick<
  WebSocket,
  'readyState' | 'onopen' | 'onclose' | 'onerror' | 'onmessage' | 'send' | 'close'
>;

export type WebSocketFactory = (url: string) => WebSocketLike;

const OPEN = 1;
const CONNECTING = 0;

export interface AgentConnectionOptions {
  url: string;
  extensionVersion: string;
  createSocket: WebSocketFactory;
  onMessage: (message: DesktopToExtensionMessage) => void;
  onStatusChange: (status: ConnectionStatus) => void;
  /** Keeps the MV3 service worker alive while connected (Chrome 116+). Default 20s. */
  heartbeatIntervalMs?: number;
  initialRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  log?: (message: string, detail?: unknown) => void;
}

/**
 * A self-healing WebSocket client for the local Atlas desktop agent.
 * Reconnects with exponential backoff whenever Atlas stops or restarts.
 */
export class AgentConnection {
  private socket: WebSocketLike | undefined;
  private status: ConnectionStatus = 'disconnected';
  private retryAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private readonly heartbeatIntervalMs: number;
  private readonly initialRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;

  constructor(private readonly options: AgentConnectionOptions) {
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 20_000;
    this.initialRetryDelayMs = options.initialRetryDelayMs ?? 1_000;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 15_000;
  }

  get currentStatus(): ConnectionStatus {
    return this.status;
  }

  /** Opens a connection unless one is already open or in progress. */
  connect(): void {
    if (this.socket && (this.socket.readyState === OPEN || this.socket.readyState === CONNECTING)) {
      return;
    }
    this.clearRetryTimer();
    this.setStatus('connecting');

    let socket: WebSocketLike;
    try {
      socket = this.options.createSocket(this.options.url);
    } catch (error) {
      this.options.log?.('Could not create WebSocket', error);
      this.handleClosed();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.retryAttempt = 0;
      this.send(
        createExtensionMessage('EXTENSION_CONNECTED', {
          extensionVersion: this.options.extensionVersion,
        }),
      );
      this.startHeartbeat();
      this.setStatus('connected');
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket || typeof event.data !== 'string') return;
      this.handleMessage(event.data);
    };
    socket.onerror = () => {
      // A close event always follows; reconnection is handled there.
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.handleClosed();
    };
  }

  /** Called periodically (chrome.alarms) as a safety net in case timers were lost. */
  ensureConnected(): void {
    if (this.status === 'disconnected') this.connect();
  }

  send(message: ExtensionToDesktopMessage): boolean {
    if (!this.socket || this.socket.readyState !== OPEN) return false;
    this.socket.send(serializeMessage(message));
    return true;
  }

  disconnect(): void {
    this.clearRetryTimer();
    this.stopHeartbeat();
    const socket = this.socket;
    this.socket = undefined;
    socket?.close(1000, 'Extension disconnect');
    this.setStatus('disconnected');
  }

  private handleMessage(raw: string): void {
    const parsed = parseDesktopMessage(raw);
    if (!parsed.ok) {
      this.options.log?.('Ignored invalid message from Atlas', parsed.error);
      return;
    }
    if (parsed.message.type === 'PING') {
      this.send(createExtensionMessage('HEARTBEAT', { replyTo: parsed.message.id }));
      return;
    }
    this.options.onMessage(parsed.message);
  }

  private handleClosed(): void {
    this.socket = undefined;
    this.stopHeartbeat();
    this.setStatus('disconnected');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.clearRetryTimer();
    const delay = Math.min(this.maxRetryDelayMs, this.initialRetryDelayMs * 2 ** this.retryAttempt);
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send(createExtensionMessage('HEARTBEAT', {}));
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== undefined) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatusChange(status);
  }
}
