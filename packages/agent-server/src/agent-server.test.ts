import { createServer } from 'node:net';

import {
  createExtensionMessage,
  parseDesktopMessage,
  type DesktopToExtensionMessage,
  type TabMetadata,
} from '@atlas/agent-protocol';
import { createLogManager, createNoopLogger, MemoryTransport } from '@atlas/logger';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import {
  AgentServer,
  type AgentServerOptions,
  type ExtensionConnectionInfo,
} from './agent-server.js';

const EXTENSION_ORIGIN = `chrome-extension://${'a'.repeat(32)}`;
const tab: TabMetadata = {
  tabId: 1,
  windowId: 1,
  url: 'https://www.wikipedia.org/',
  title: 'Wikipedia',
  status: 'complete',
  incognito: false,
};

const servers: AgentServer[] = [];
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

async function startServer(options: Partial<AgentServerOptions> = {}) {
  const server = new AgentServer({ port: 0, logger: createNoopLogger(), ...options });
  servers.push(server);
  await server.start();
  const port = server.address?.port;
  if (!port) throw new Error('server has no port');
  return { server, port };
}

/** A minimal stand-in for the extension, speaking the real protocol. */
async function connectClient(port: number, origin = EXTENSION_ORIGIN) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
  sockets.push(socket);
  const received: DesktopToExtensionMessage[] = [];
  socket.on('message', (data) => {
    const text = Array.isArray(data)
      ? Buffer.concat(data).toString('utf8')
      : Buffer.from(data as ArrayBuffer).toString('utf8');
    const parsed = parseDesktopMessage(text);
    if (parsed.ok) received.push(parsed.message);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
    socket.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });
  return {
    socket,
    received,
    send: (value: unknown) =>
      socket.send(typeof value === 'string' ? value : JSON.stringify(value)),
    hello: () =>
      socket.send(
        JSON.stringify(
          createExtensionMessage('EXTENSION_CONNECTED', { extensionVersion: '0.1.0' }),
        ),
      ),
    closed: new Promise<number>((resolve) => socket.once('close', (code) => resolve(code))),
  };
}

const waitFor = async (predicate: () => boolean, timeoutMs = 3_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe('AgentServer', () => {
  it('listens on the loopback interface only', async () => {
    const { server } = await startServer();
    expect(server.address?.host).toBe('127.0.0.1');
  });

  it('becomes CONNECTED only after the extension introduces itself', async () => {
    const { server, port } = await startServer();
    const changes: ExtensionConnectionInfo[] = [];
    server.onConnectionChange((info) => changes.push(info));

    const client = await connectClient(port);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(server.connection.state).toBe('DISCONNECTED');

    client.hello();
    await waitFor(() => server.connection.state === 'CONNECTED');
    expect(server.connection).toMatchObject({ extensionVersion: '0.1.0' });

    client.socket.close();
    await waitFor(() => server.connection.state === 'DISCONNECTED');
    expect(changes.map((c) => c.state)).toEqual(['CONNECTED', 'DISCONNECTED']);
  });

  it('rejects connections from web pages and other non-extension origins', async () => {
    const { server, port } = await startServer();
    await expect(connectClient(port, 'https://evil.example')).rejects.toThrow('HTTP 401');
    expect(server.connection.state).toBe('DISCONNECTED');
  });

  it('round-trips a page metadata request', async () => {
    const { server, port } = await startServer();
    const client = await connectClient(port);
    client.hello();
    await waitFor(() => server.connection.state === 'CONNECTED');

    const pending = server.requestPageMetadata();
    await waitFor(() => client.received.some((m) => m.type === 'GET_PAGE_METADATA'));
    const request = client.received.find((m) => m.type === 'GET_PAGE_METADATA');
    if (request?.type !== 'GET_PAGE_METADATA') throw new Error('no request');
    client.send(
      createExtensionMessage('PAGE_METADATA', { requestId: request.payload.requestId, tab }),
    );

    await expect(pending).resolves.toEqual(tab);
  });

  it('fails metadata requests when no extension is connected, or on timeout', async () => {
    const { server, port } = await startServer({ requestTimeoutMs: 50 });
    await expect(server.requestPageMetadata()).rejects.toThrow('not connected');

    const client = await connectClient(port);
    client.hello();
    await waitFor(() => server.connection.state === 'CONNECTED');
    await expect(server.requestPageMetadata()).rejects.toThrow('timed out');
  });

  it('delivers valid messages and ignores invalid ones, closing abusive connections', async () => {
    const memory = new MemoryTransport();
    const { server, port } = await startServer({
      logger: createLogManager({ transports: [memory], minLevel: 'debug' }).forComponent('server'),
    });
    const messages: string[] = [];
    server.onMessage((message) => messages.push(message.type));

    const client = await connectClient(port);
    client.send(createExtensionMessage('HEARTBEAT', {})); // before hello: ignored
    client.hello();
    await waitFor(() => server.connection.state === 'CONNECTED');
    client.send(createExtensionMessage('PAGE_CHANGED', { reason: 'activated', tab }));
    await waitFor(() => messages.includes('PAGE_CHANGED'));
    expect(messages).toEqual(['EXTENSION_CONNECTED', 'PAGE_CHANGED']);

    for (let i = 0; i < 5; i += 1) client.send('{"type":"EVAL","payload":"alert(1)"}');
    expect(await client.closed).toBe(4001);
    expect(memory.recent().some((e) => e.message === 'Ignored invalid extension message')).toBe(
      true,
    );
  });

  it('replaces an older connection when a new extension instance connects', async () => {
    const { server, port } = await startServer();
    const first = await connectClient(port);
    first.hello();
    await waitFor(() => server.connection.state === 'CONNECTED');

    const second = await connectClient(port);
    second.hello();
    expect(await first.closed).toBe(4000);
    expect(server.connection.state).toBe('CONNECTED');
    expect(
      server.send({ v: 1, id: 'p', sentAt: new Date().toISOString(), type: 'PING', payload: {} }),
    ).toBe(true);
    await waitFor(() => second.received.some((m) => m.type === 'PING'));
  });

  it('pings the extension and drops silent connections', async () => {
    const { server, port } = await startServer({ pingIntervalMs: 30, idleTimeoutMs: 150 });
    const client = await connectClient(port);
    client.hello();
    await waitFor(() => client.received.some((m) => m.type === 'PING'));
    await waitFor(() => server.connection.state === 'DISCONNECTED', 2_000);
  });

  it('closes clients when stopped', async () => {
    const { server, port } = await startServer();
    const client = await connectClient(port);
    client.hello();
    await waitFor(() => server.connection.state === 'CONNECTED');
    await server.stop();
    expect(await client.closed).toBe(1001);
    expect(server.connection.state).toBe('DISCONNECTED');
  });

  it('reports a clear error when the port is taken', async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const address = blocker.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    try {
      const server = new AgentServer({ port, logger: createNoopLogger() });
      await expect(server.start()).rejects.toThrow(`Port ${port} on 127.0.0.1 is already in use`);
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });
});
