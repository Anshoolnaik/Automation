import { describe, expect, it } from 'vitest';

import {
  MAX_MESSAGE_BYTES,
  createDesktopMessage,
  createExtensionMessage,
  parseDesktopMessage,
  parseExtensionMessage,
  serializeMessage,
  type TabMetadata,
} from './messages.js';

const tab: TabMetadata = {
  tabId: 7,
  windowId: 1,
  url: 'https://en.wikipedia.org/wiki/Alan_Turing',
  title: 'Alan Turing - Wikipedia',
  status: 'complete',
  incognito: false,
};

const fixed = { id: 'msg-1', now: new Date('2026-09-13T12:00:00.000Z') };

describe('extension -> desktop messages', () => {
  it.each([
    createExtensionMessage('EXTENSION_CONNECTED', { extensionVersion: '0.1.0' }, fixed),
    createExtensionMessage('PAGE_CHANGED', { reason: 'updated', tab }, fixed),
    createExtensionMessage('PAGE_METADATA', { requestId: 'req-1', tab }, fixed),
    createExtensionMessage('PAGE_METADATA', { requestId: 'req-2', tab: null }, fixed),
    createExtensionMessage('HEARTBEAT', {}, fixed),
    createExtensionMessage('HEARTBEAT', { replyTo: 'ping-1' }, fixed),
  ])('round-trips $type', (message) => {
    expect(parseExtensionMessage(serializeMessage(message))).toEqual({ ok: true, message });
  });

  it('builds a complete envelope', () => {
    expect(createExtensionMessage('HEARTBEAT', {}, fixed)).toEqual({
      v: 1,
      id: 'msg-1',
      sentAt: '2026-09-13T12:00:00.000Z',
      type: 'HEARTBEAT',
      payload: {},
    });
    expect(createExtensionMessage('HEARTBEAT', {}).id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects malformed JSON', () => {
    expect(parseExtensionMessage('{not json')).toEqual({
      ok: false,
      error: 'Message is not valid JSON',
    });
  });

  it('rejects oversized messages before parsing', () => {
    const result = parseExtensionMessage('x'.repeat(MAX_MESSAGE_BYTES + 1));
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining('exceeds') as string,
    });
  });

  it.each([
    ['unknown type', { ...createExtensionMessage('HEARTBEAT', {}, fixed), type: 'EXECUTE_SCRIPT' }],
    ['wrong version', { ...createExtensionMessage('HEARTBEAT', {}, fixed), v: 2 }],
    ['bad timestamp', { ...createExtensionMessage('HEARTBEAT', {}, fixed), sentAt: 'yesterday' }],
    [
      'extra payload fields',
      createExtensionMessage(
        'PAGE_CHANGED',
        { reason: 'updated', tab: { ...tab, cookies: 'x' } as TabMetadata },
        fixed,
      ),
    ],
    ['missing payload', { v: 1, id: 'a', sentAt: fixed.now.toISOString(), type: 'PAGE_METADATA' }],
    ['a desktop-only message', createDesktopMessage('PING', {}, fixed)],
  ])('rejects %s', (_label, message) => {
    const result = parseExtensionMessage(JSON.stringify(message));
    expect(result.ok).toBe(false);
  });

  it('explains where validation failed', () => {
    const message = createExtensionMessage('PAGE_METADATA', { requestId: '', tab: null }, fixed);
    const result = parseExtensionMessage(JSON.stringify(message));
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining('payload.requestId') as string,
    });
  });
});

describe('desktop -> extension messages', () => {
  it.each([
    createDesktopMessage('PING', {}, fixed),
    createDesktopMessage('GET_PAGE_METADATA', { requestId: 'req-1' }, fixed),
    createDesktopMessage(
      'TASK_STATUS',
      { taskId: 't1', status: 'RUNNING', command: 'Open wikipedia.org' },
      fixed,
    ),
    createDesktopMessage(
      'TASK_STATUS',
      { taskId: 't1', status: 'FAILED', command: 'Open x', message: 'Navigation failed' },
      fixed,
    ),
  ])('round-trips $type', (message) => {
    expect(parseDesktopMessage(serializeMessage(message))).toEqual({ ok: true, message });
  });

  it('rejects invalid task statuses and extension-only messages', () => {
    const badStatus = {
      ...createDesktopMessage(
        'TASK_STATUS',
        { taskId: 't', status: 'RUNNING', command: 'c' },
        fixed,
      ),
      payload: { taskId: 't', status: 'EXPLODED', command: 'c' },
    };
    expect(parseDesktopMessage(JSON.stringify(badStatus)).ok).toBe(false);
    expect(
      parseDesktopMessage(JSON.stringify(createExtensionMessage('HEARTBEAT', {}, fixed))).ok,
    ).toBe(false);
  });
});
