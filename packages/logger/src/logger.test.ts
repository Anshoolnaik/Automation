import { describe, expect, it, vi } from 'vitest';

import { createLogManager } from './logger.js';
import { MemoryTransport } from './transports/memory-transport.js';
import { REDACTED } from './redact.js';
import type { LogEntry, LogTransport } from './types.js';

const fixedNow = () => new Date('2026-09-13T12:41:12.000Z');

describe('createLogManager', () => {
  it('produces structured, sanitized entries', () => {
    const memory = new MemoryTransport();
    const logs = createLogManager({ transports: [memory], minLevel: 'debug', now: fixedNow });

    logs.forComponent('browser').info('Navigated', {
      taskId: 'task-1',
      metadata: { url: 'https://site.test/?token=abc', cookie: 'sid=1' },
    });

    expect(memory.recent()).toEqual<LogEntry[]>([
      {
        timestamp: '2026-09-13T12:41:12.000Z',
        level: 'info',
        component: 'browser',
        message: 'Navigated',
        taskId: 'task-1',
        metadata: { url: `https://site.test/?token=${REDACTED}`, cookie: REDACTED },
      },
    ]);
  });

  it('filters by global and per-transport levels', () => {
    const all = new MemoryTransport();
    const warnOnly = new MemoryTransport({ minLevel: 'warn' });
    const logger = createLogManager({ transports: [all, warnOnly], minLevel: 'info' }).forComponent(
      'x',
    );

    logger.debug('hidden');
    logger.info('info');
    logger.error('error');

    expect(all.recent().map((e) => e.message)).toEqual(['info', 'error']);
    expect(warnOnly.recent().map((e) => e.message)).toEqual(['error']);
  });

  it('names child components hierarchically', () => {
    const memory = new MemoryTransport();
    createLogManager({ transports: [memory] })
      .forComponent('browser')
      .child('playwright')
      .info('hi');
    expect(memory.recent()[0]?.component).toBe('browser.playwright');
  });

  it('keeps delivering when one transport throws', () => {
    const broken: LogTransport = {
      write: () => {
        throw new Error('disk full');
      },
    };
    const memory = new MemoryTransport();
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    createLogManager({ transports: [broken, memory] })
      .forComponent('x')
      .warn('still here');

    expect(memory.recent()).toHaveLength(1);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('disk full'));
  });

  it('flushes and closes all transports', async () => {
    const calls: string[] = [];
    const transport: LogTransport = {
      write: () => undefined,
      flush: () => {
        calls.push('flush');
        return Promise.resolve();
      },
      close: () => {
        calls.push('close');
        return Promise.resolve();
      },
    };
    const logs = createLogManager({ transports: [transport] });
    await logs.flush();
    await logs.close();
    expect(calls).toEqual(['flush', 'close']);
  });
});

describe('MemoryTransport', () => {
  it('bounds its buffer and notifies subscribers until unsubscribed', () => {
    const memory = new MemoryTransport({ capacity: 2 });
    const seen: string[] = [];
    const unsubscribe = memory.subscribe((entry) => seen.push(entry.message));
    const logger = createLogManager({ transports: [memory] }).forComponent('x');

    logger.info('a');
    logger.info('b');
    unsubscribe();
    logger.info('c');

    expect(memory.recent().map((e) => e.message)).toEqual(['b', 'c']);
    expect(seen).toEqual(['a', 'b']);
  });
});
