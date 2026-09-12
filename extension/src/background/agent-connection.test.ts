import {
  createDesktopMessage,
  parseExtensionMessage,
  type DesktopToExtensionMessage,
  type ExtensionToDesktopMessage,
} from '@atlas/agent-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConnectionStatus } from '../shared/runtime-messages.js';
import { AgentConnection, type WebSocketLike } from './agent-connection.js';

class FakeSocket implements WebSocketLike {
  readyState = 0;
  onopen: WebSocketLike['onopen'] = null;
  onclose: WebSocketLike['onclose'] = null;
  onerror: WebSocketLike['onerror'] = null;
  onmessage: WebSocketLike['onmessage'] = null;
  readonly sent: ExtensionToDesktopMessage[] = [];

  private get self(): WebSocket {
    return this as unknown as WebSocket;
  }

  send(data: unknown): void {
    if (typeof data !== 'string') throw new Error('extension must send text frames');
    const parsed = parseExtensionMessage(data);
    if (!parsed.ok) throw new Error(`extension sent an invalid message: ${parsed.error}`);
    this.sent.push(parsed.message);
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.call(this.self, new Event('open'));
  }

  fail(): void {
    this.readyState = 3;
    this.onerror?.call(this.self, new Event('error'));
    this.onclose?.call(this.self, new Event('close') as CloseEvent);
  }

  receive(message: DesktopToExtensionMessage | string): void {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    this.onmessage?.call(this.self, { data } as MessageEvent);
  }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const statuses: ConnectionStatus[] = [];
  const messages: DesktopToExtensionMessage[] = [];
  const connection = new AgentConnection({
    url: 'ws://127.0.0.1:47821',
    extensionVersion: '0.1.0',
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    onMessage: (message) => messages.push(message),
    onStatusChange: (status) => statuses.push(status),
    heartbeatIntervalMs: 20_000,
    initialRetryDelayMs: 1_000,
    maxRetryDelayMs: 8_000,
  });
  const latest = () => {
    const socket = sockets.at(-1);
    if (!socket) throw new Error('no socket created');
    return socket;
  };
  return { connection, sockets, statuses, messages, latest };
}

describe('AgentConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('introduces itself once the socket opens', () => {
    const { connection, latest, statuses } = setup();
    connection.connect();
    latest().open();

    expect(statuses).toEqual(['connecting', 'connected']);
    expect(latest().sent).toMatchObject([
      { type: 'EXTENSION_CONNECTED', payload: { extensionVersion: '0.1.0' } },
    ]);
  });

  it('does not open a second socket while connecting or connected', () => {
    const { connection, sockets, latest } = setup();
    connection.connect();
    connection.connect();
    latest().open();
    connection.connect();
    connection.ensureConnected();
    expect(sockets).toHaveLength(1);
  });

  it('answers PING with HEARTBEAT and forwards other messages', () => {
    const { connection, latest, messages } = setup();
    connection.connect();
    latest().open();

    const ping = createDesktopMessage('PING', {});
    latest().receive(ping);
    latest().receive(createDesktopMessage('GET_PAGE_METADATA', { requestId: 'r1' }));
    latest().receive('{"type":"RUN_SCRIPT"}');

    expect(latest().sent.at(-1)).toMatchObject({
      type: 'HEARTBEAT',
      payload: { replyTo: ping.id },
    });
    expect(messages.map((m) => m.type)).toEqual(['GET_PAGE_METADATA']);
  });

  it('sends heartbeats while connected', () => {
    const { connection, latest } = setup();
    connection.connect();
    latest().open();
    vi.advanceTimersByTime(60_000);
    expect(latest().sent.filter((m) => m.type === 'HEARTBEAT')).toHaveLength(3);
  });

  it('reconnects with exponential backoff when Atlas is unavailable, then resets after success', () => {
    const { connection, sockets, latest, statuses } = setup();
    connection.connect();
    latest().fail(); // Atlas not running
    expect(statuses.at(-1)).toBe('disconnected');

    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2); // retry after 1s
    latest().fail();
    vi.advanceTimersByTime(2_000);
    expect(sockets).toHaveLength(3); // then 2s
    latest().fail();
    vi.advanceTimersByTime(4_000);
    latest().fail();
    vi.advanceTimersByTime(8_000);
    latest().fail();
    vi.advanceTimersByTime(8_000); // capped at 8s
    expect(sockets).toHaveLength(6);

    latest().open(); // Atlas came back
    expect(statuses.at(-1)).toBe('connected');
    latest().fail(); // Atlas restarted
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(7); // backoff reset to 1s
  });

  it('stops heartbeats after a disconnect and ignores events from stale sockets', () => {
    const { connection, sockets, latest } = setup();
    connection.connect();
    const first = latest();
    first.open();
    first.fail();
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);

    first.onopen?.call(first as unknown as WebSocket, new Event('open')); // stale
    expect(connection.currentStatus).toBe('connecting');
    vi.advanceTimersByTime(60_000);
    expect(first.sent.filter((m) => m.type === 'HEARTBEAT')).toHaveLength(0);
  });

  it('refuses to send while disconnected', () => {
    const { connection } = setup();
    expect(
      connection.send({
        v: 1,
        id: 'x',
        sentAt: new Date().toISOString(),
        type: 'HEARTBEAT',
        payload: {},
      }),
    ).toBe(false);
  });
});
