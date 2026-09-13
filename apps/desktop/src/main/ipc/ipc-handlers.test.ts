import { createLogManager, createNoopLogger, MemoryTransport } from '@atlas/logger';
import { describe, expect, it, vi } from 'vitest';

import { IpcChannel } from '../../shared/ipc-channels.js';
import { MAX_COMMAND_LENGTH } from '../../shared/ipc-limits.js';
import type { AgentStatusSnapshot, LogEntryDto } from '../../shared/ipc-types.js';
import type { AgentFacade } from '../agent-facade.js';
import type { SearchFacade } from '../search/search-facade.js';
import { LogBroadcaster, type LogSubscriber } from '../logging/log-broadcaster.js';
import { createIpcHandlers } from './ipc-handlers.js';

const snapshot: AgentStatusSnapshot = {
  agent: 'IDLE',
  browser: 'STOPPED',
  extension: { state: 'DISCONNECTED' },
};

function setup(overrides: Partial<AgentFacade> = {}, shuttingDown = false) {
  const mocks = {
    launchBrowser: vi.fn(() => Promise.resolve()),
    stopBrowser: vi.fn(() => Promise.resolve()),
    runTask: vi.fn((command: string) =>
      Promise.resolve({ taskId: 't1', status: 'COMPLETED' as const, finalTitle: command }),
    ),
  };
  const agent: AgentFacade = {
    getStatus: () => snapshot,
    onStatusChanged: () => () => undefined,
    ...mocks,
    ...overrides,
  };
  const memory = new MemoryTransport();
  const logManager = createLogManager({ transports: [memory] });
  const logs = new LogBroadcaster(memory);
  const search: SearchFacade = {
    createCampaign: vi.fn(),
    planCampaign: vi.fn(),
    listCampaigns: vi.fn(() => []),
    getCampaign: vi.fn(),
    getProgress: vi.fn(),
    listJobs: vi.fn(() => []),
  };
  const handlers = createIpcHandlers({
    agent,
    search,
    logs,
    logger: createNoopLogger(),
    isShuttingDown: () => shuttingDown,
  });
  const received: LogEntryDto[] = [];
  const sender: LogSubscriber = { id: 1, isDestroyed: () => false, send: (e) => received.push(e) };
  return { mocks, handlers, sender, received, logger: logManager.forComponent('test') };
}

describe('IPC handlers', () => {
  it('covers exactly the whitelisted channels', () => {
    const { handlers } = setup();
    expect(Object.keys(handlers).sort()).toEqual(Object.values(IpcChannel).sort());
  });

  it('returns status snapshots', async () => {
    const { handlers, sender } = setup();
    await expect(handlers[IpcChannel.AgentGetStatus](undefined, sender)).resolves.toEqual({
      ok: true,
      data: snapshot,
    });
    await expect(handlers[IpcChannel.ExtensionGetStatus](undefined, sender)).resolves.toEqual({
      ok: true,
      data: { state: 'DISCONNECTED' },
    });
  });

  it('runs a task with a trimmed command', async () => {
    const { handlers, sender, mocks } = setup();
    const result = await handlers[IpcChannel.TaskRun](
      { command: '  Open wikipedia.org  ' },
      sender,
    );
    expect(mocks.runTask).toHaveBeenCalledWith('Open wikipedia.org');
    expect(result).toMatchObject({ ok: true, data: { taskId: 't1', status: 'COMPLETED' } });
  });

  it.each([
    ['missing payload', undefined],
    ['wrong type', { command: 42 }],
    ['empty command', { command: '   ' }],
    ['too long', { command: 'x'.repeat(MAX_COMMAND_LENGTH + 1) }],
    ['unexpected keys', { command: 'Open a.com', script: 'evil()' }],
    ['non-object', 'Open a.com'],
  ])('rejects task:run with %s', async (_label, payload) => {
    const { handlers, sender, mocks } = setup();
    const result = await handlers[IpcChannel.TaskRun](payload, sender);
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(mocks.runTask).not.toHaveBeenCalled();
  });

  it('rejects payloads on channels that take none', async () => {
    const { handlers, sender, mocks } = setup();
    const result = await handlers[IpcChannel.BrowserLaunch]({ executablePath: '/bin/sh' }, sender);
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(mocks.launchBrowser).not.toHaveBeenCalled();
  });

  it('converts thrown errors into sanitized results, preserving domain codes', async () => {
    const error = Object.assign(new Error('Chrome is not running. token=abc'), {
      code: 'BROWSER_NOT_RUNNING',
    });
    const { handlers, sender } = setup({ runTask: () => Promise.reject(error) });
    const result = await handlers[IpcChannel.TaskRun]({ command: 'Open a.com' }, sender);
    expect(result).toEqual({
      ok: false,
      error: { code: 'BROWSER_NOT_RUNNING', message: 'Chrome is not running. token=abc' },
    });

    const { handlers: other } = setup({
      launchBrowser: () => Promise.reject(Object.assign(new Error('x'), { code: 'EACCES' })),
    });
    await expect(other[IpcChannel.BrowserLaunch](undefined, sender)).resolves.toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    });
  });

  it('refuses new work during shutdown but still allows stopping', async () => {
    const { handlers, sender, mocks } = setup({}, true);
    await expect(
      handlers[IpcChannel.TaskRun]({ command: 'Open a.com' }, sender),
    ).resolves.toMatchObject({ ok: false, error: { code: 'SHUTTING_DOWN' } });
    await expect(handlers[IpcChannel.BrowserStop](undefined, sender)).resolves.toEqual({
      ok: true,
      data: null,
    });
    expect(mocks.stopBrowser).toHaveBeenCalled();
  });

  it('subscribes to logs: returns backlog, then pushes live entries', async () => {
    const { handlers, sender, received, logger } = setup();
    logger.info('before');
    const result = await handlers[IpcChannel.LogsSubscribe](undefined, sender);
    logger.info('after');

    expect(result).toMatchObject({ ok: true, data: [{ seq: 1, message: 'before' }] });
    expect(received).toMatchObject([{ seq: 2, message: 'after' }]);
  });
});
