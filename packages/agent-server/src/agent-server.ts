import type { IncomingMessage } from 'node:http';

import {
  AGENT_HOST,
  MAX_MESSAGE_BYTES,
  createDesktopMessage,
  parseExtensionMessage,
  serializeMessage,
  type DesktopToExtensionMessage,
  type ExtensionState,
  type ExtensionToDesktopMessage,
  type TabMetadata,
} from '@atlas/agent-protocol';
import type { Logger } from '@atlas/logger';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';

import { createOriginPolicy, isLoopbackAddress } from './origin-policy.js';
import { PendingRequests } from './pending-requests.js';

export interface AgentServerOptions {
  port: number;
  logger: Logger;
  /** Restrict connections to specific extension IDs. Default: any Chrome extension origin. */
  allowedExtensionIds?: readonly string[];
  pingIntervalMs?: number;
  /** A connection that sends nothing for this long is considered dead. */
  idleTimeoutMs?: number;
  requestTimeoutMs?: number;
}

export interface ExtensionConnectionInfo {
  state: ExtensionState;
  extensionVersion?: string;
  connectedAt?: string;
}

type ConnectionListener = (info: ExtensionConnectionInfo) => void;
type MessageListener = (message: ExtensionToDesktopMessage) => void;

interface Client {
  socket: WebSocket;
  lastSeen: number;
  extensionVersion?: string;
  connectedAt?: string;
}

const CLOSE_REPLACED = 4000;
const CLOSE_PROTOCOL_ERROR = 4001;
const CLOSE_IDLE = 4002;
const CLOSE_SHUTDOWN = 1001;
const MAX_INVALID_MESSAGES = 5;

/**
 * Localhost-only WebSocket endpoint for the Atlas extension. One extension
 * connection is active at a time; it counts as CONNECTED only after it has
 * introduced itself with EXTENSION_CONNECTED.
 */
export class AgentServer {
  private server: WebSocketServer | undefined;
  private active: Client | undefined;
  private pingTimer: NodeJS.Timeout | undefined;
  private readonly logger: Logger;
  private readonly isAllowedOrigin: (origin: string | undefined) => boolean;
  private readonly pingIntervalMs: number;
  private readonly idleTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly pageRequests = new PendingRequests<TabMetadata | null>();
  private readonly connectionListeners = new Set<ConnectionListener>();
  private readonly messageListeners = new Set<MessageListener>();
  private readonly invalidMessageCounts = new WeakMap<WebSocket, number>();

  constructor(private readonly options: AgentServerOptions) {
    this.logger = options.logger;
    this.isAllowedOrigin = createOriginPolicy(
      options.allowedExtensionIds ? { allowedExtensionIds: options.allowedExtensionIds } : {},
    );
    this.pingIntervalMs = options.pingIntervalMs ?? 20_000;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 60_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
  }

  get connection(): ExtensionConnectionInfo {
    const client = this.active;
    if (!client) return { state: 'DISCONNECTED' };
    const info: ExtensionConnectionInfo = { state: 'CONNECTED' };
    if (client.extensionVersion) info.extensionVersion = client.extensionVersion;
    if (client.connectedAt) info.connectedAt = client.connectedAt;
    return info;
  }

  get address(): { host: string; port: number } | undefined {
    const address = this.server?.address();
    return address && typeof address === 'object'
      ? { host: address.address, port: address.port }
      : undefined;
  }

  async start(): Promise<void> {
    if (this.server) return;
    const server = new WebSocketServer({
      host: AGENT_HOST, // Never exposed beyond the loopback interface.
      port: this.options.port,
      maxPayload: MAX_MESSAGE_BYTES,
      perMessageDeflate: false,
      verifyClient: (info: { origin: string; req: IncomingMessage }) => this.verifyClient(info),
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException) => {
        server.off('listening', onListening);
        reject(
          error.code === 'EADDRINUSE'
            ? new Error(`Port ${this.options.port} on ${AGENT_HOST} is already in use`, {
                cause: error,
              })
            : error,
        );
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
    });

    server.on('connection', (socket) => this.handleConnection(socket));
    server.on('error', (error) => this.logger.error('Agent server error', { metadata: { error } }));
    this.server = server;
    this.pingTimer = setInterval(() => this.checkConnection(), this.pingIntervalMs);
    this.pingTimer.unref();
    this.logger.info(`Local agent server listening on ${AGENT_HOST}:${this.options.port}`);
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = undefined;
    clearInterval(this.pingTimer);
    this.pageRequests.rejectAll('Agent server stopped');
    for (const socket of server.clients) socket.close(CLOSE_SHUTDOWN, 'Atlas is shutting down');
    this.setActive(undefined);
    await new Promise<void>((resolve) => {
      const force = setTimeout(() => {
        for (const socket of server.clients) socket.terminate();
      }, 1_000);
      server.close(() => {
        clearTimeout(force);
        resolve();
      });
    });
    this.logger.info('Local agent server stopped');
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  /** Sends to the connected extension. Returns false when none is connected. */
  send(message: DesktopToExtensionMessage): boolean {
    const socket = this.active?.socket;
    if (!socket || socket.readyState !== socket.OPEN) return false;
    socket.send(serializeMessage(message));
    return true;
  }

  /** Asks the extension for the active tab's metadata. */
  requestPageMetadata(): Promise<TabMetadata | null> {
    if (!this.active) return Promise.reject(new Error('The Atlas extension is not connected'));
    const request = createDesktopMessage('GET_PAGE_METADATA', {
      requestId: globalThis.crypto.randomUUID(),
    });
    const response = this.pageRequests.create(request.payload.requestId, this.requestTimeoutMs);
    this.send(request);
    return response;
  }

  private verifyClient(info: { origin: string; req: IncomingMessage }): boolean {
    const remote = info.req.socket.remoteAddress;
    if (!isLoopbackAddress(remote)) {
      this.logger.warn('Rejected non-loopback WebSocket connection', { metadata: { remote } });
      return false;
    }
    if (!this.isAllowedOrigin(info.origin)) {
      this.logger.warn('Rejected WebSocket connection from disallowed origin', {
        metadata: { origin: info.origin || '(none)' },
      });
      return false;
    }
    return true;
  }

  private handleConnection(socket: WebSocket): void {
    const client: Client = { socket, lastSeen: Date.now() };
    this.logger.debug('Extension socket opened');

    socket.on('message', (data, isBinary) => {
      client.lastSeen = Date.now();
      if (isBinary) {
        this.rejectMessage(client, 'Binary frames are not supported');
        return;
      }
      this.handleMessage(client, rawDataToString(data));
    });
    socket.on('close', (code) => {
      this.logger.debug('Extension socket closed', { metadata: { code } });
      if (this.active === client) {
        this.pageRequests.rejectAll('The Atlas extension disconnected');
        this.setActive(undefined);
      }
    });
    socket.on('error', (error) => {
      this.logger.warn('Extension socket error', { metadata: { error } });
    });
  }

  private handleMessage(client: Client, raw: string): void {
    const parsed = parseExtensionMessage(raw);
    if (!parsed.ok) {
      this.rejectMessage(client, parsed.error);
      return;
    }
    const { message } = parsed;

    if (message.type === 'EXTENSION_CONNECTED') {
      client.extensionVersion = message.payload.extensionVersion;
      client.connectedAt = new Date().toISOString();
      if (this.active && this.active !== client) {
        this.active.socket.close(CLOSE_REPLACED, 'Replaced by a newer extension connection');
      }
      this.setActive(client);
    } else if (this.active !== client) {
      this.rejectMessage(client, `${message.type} received before EXTENSION_CONNECTED`);
      return;
    }

    if (message.type === 'PAGE_METADATA') {
      this.pageRequests.resolve(message.payload.requestId, message.payload.tab);
    }
    for (const listener of this.messageListeners) listener(message);
  }

  private rejectMessage(client: Client, reason: string): void {
    const count = (this.invalidMessageCounts.get(client.socket) ?? 0) + 1;
    this.invalidMessageCounts.set(client.socket, count);
    this.logger.warn('Ignored invalid extension message', { metadata: { reason, count } });
    if (count >= MAX_INVALID_MESSAGES) {
      client.socket.close(CLOSE_PROTOCOL_ERROR, 'Too many invalid messages');
    }
  }

  private checkConnection(): void {
    const client = this.active;
    if (!client) return;
    if (Date.now() - client.lastSeen > this.idleTimeoutMs) {
      this.logger.warn('Extension connection went silent; closing it');
      client.socket.close(CLOSE_IDLE, 'Idle timeout');
      client.socket.terminate();
      return;
    }
    this.send(createDesktopMessage('PING', {}));
  }

  private setActive(client: Client | undefined): void {
    const wasConnected = this.active !== undefined;
    this.active = client;
    if (client) {
      this.logger.info('Extension connected', {
        metadata: { extensionVersion: client.extensionVersion },
      });
    } else if (wasConnected) {
      this.logger.info('Extension disconnected');
    } else {
      return;
    }
    const info = this.connection;
    for (const listener of this.connectionListeners) listener(info);
  }
}

function rawDataToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}
