import { describe, expect, it } from 'vitest';

import { executeBrowserAction } from './action-executor.js';
import { describeAction, type BrowserAction } from './actions.js';
import type { BrowserController } from './browser-controller.js';

function recordingController(calls: unknown[][]): BrowserController {
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
      return Promise.resolve();
    };
  return {
    isRunning: true,
    launch: record('launch'),
    close: record('close'),
    goto: record('goto'),
    click: record('click'),
    type: record('type'),
    press: record('press'),
    scroll: record('scroll'),
    getPageTitle: () => Promise.resolve(''),
    getCurrentUrl: () => Promise.resolve(''),
    getPageText: () => Promise.resolve(''),
    onDisconnected: () => () => undefined,
  };
}

describe('executeBrowserAction', () => {
  it('maps every action type to the matching controller call', async () => {
    const calls: unknown[][] = [];
    const controller = recordingController(calls);
    const actions: BrowserAction[] = [
      { type: 'navigate', url: 'https://example.com' },
      { type: 'click', selector: '#go' },
      { type: 'fill', selector: '#q', value: 'Alan Turing' },
      { type: 'press', selector: '#q', key: 'Enter' },
      { type: 'scroll', direction: 'down', amount: 300 },
    ];
    for (const action of actions) await executeBrowserAction(controller, action);

    expect(calls).toEqual([
      ['goto', 'https://example.com'],
      ['click', '#go'],
      ['type', '#q', 'Alan Turing'],
      ['press', '#q', 'Enter'],
      ['scroll', 'down', 300],
    ]);
  });

  it('propagates controller errors', async () => {
    const controller = {
      ...recordingController([]),
      goto: () => Promise.reject(new Error('net::ERR_NAME_NOT_RESOLVED')),
    };
    await expect(
      executeBrowserAction(controller, { type: 'navigate', url: 'https://nope.invalid' }),
    ).rejects.toThrow('ERR_NAME_NOT_RESOLVED');
  });
});

describe('describeAction', () => {
  it('never includes filled values (they may be sensitive)', () => {
    expect(describeAction({ type: 'fill', selector: '#pw', value: 'hunter2' })).toBe(
      'Type into #pw',
    );
  });
});
