import { BrowserError } from '@atlas/browser-core';
import { createNoopLogger } from '@atlas/logger';
import { describe, expect, it } from 'vitest';

import { AgentError } from '../errors.js';
import type { BrowserEventInput } from '../ports.js';
import { FakeBrowserController } from '../testing/fake-browser-controller.js';
import { BrowserSession, type BrowserSessionStatus } from './browser-session.js';

function setup() {
  const controller = new FakeBrowserController();
  const events: BrowserEventInput[] = [];
  const session = new BrowserSession(controller, createNoopLogger(), {
    record: (event) => events.push(event),
  });
  const states: BrowserSessionStatus[] = [];
  session.onStatusChange((status) => states.push(status));
  return { controller, events, session, states };
}

describe('BrowserSession', () => {
  it('launches: STOPPED -> STARTING -> RUNNING', async () => {
    const { session, states, events } = setup();
    await session.launch();
    expect(states.map((s) => s.state)).toEqual(['STARTING', 'RUNNING']);
    expect(events).toEqual([{ type: 'BROWSER_LAUNCHED' }]);
    expect(session.requireRunningController().isRunning).toBe(true);
  });

  it('is idempotent and serializes concurrent launches', async () => {
    const { session, controller } = setup();
    await Promise.all([session.launch(), session.launch()]);
    await session.launch();
    expect(controller.calls.filter(([m]) => m === 'launch')).toHaveLength(1);
  });

  it('reports launch failures with the controller message and allows retry', async () => {
    const { session, controller, states } = setup();
    controller.launchError = new BrowserError(
      'CHROME_NOT_FOUND',
      'Google Chrome was not found.',
      'launch',
    );

    const failure = session.launch();
    await expect(failure).rejects.toBeInstanceOf(AgentError);
    await expect(failure).rejects.toMatchObject({
      code: 'BROWSER_LAUNCH_FAILED',
      message: 'Google Chrome was not found.',
    });
    expect(session.status).toEqual({ state: 'ERROR', message: 'Google Chrome was not found.' });

    controller.launchError = undefined;
    await session.launch();
    expect(session.status).toEqual({ state: 'RUNNING' });
    expect(states.map((s) => s.state)).toEqual(['STARTING', 'ERROR', 'STARTING', 'RUNNING']);
  });

  it('stops a running browser and ignores stop when already stopped', async () => {
    const { session, controller } = setup();
    await session.stop();
    await session.launch();
    await session.stop();
    expect(session.status.state).toBe('STOPPED');
    expect(controller.calls).toEqual([['launch'], ['close']]);
  });

  it('marks the browser DISCONNECTED when Chrome is closed externally, then relaunches', async () => {
    const { session, controller, events } = setup();
    await session.launch();
    controller.simulateUserClosedBrowser();
    expect(session.status).toEqual({
      state: 'DISCONNECTED',
      message: 'Chrome was closed outside Atlas',
    });
    expect(events.at(-1)).toEqual({ type: 'BROWSER_DISCONNECTED' });
    expect(() => session.requireRunningController()).toThrow(AgentError);

    await session.launch();
    expect(session.status).toEqual({ state: 'RUNNING' });
  });

  it('refuses task execution while not running', () => {
    const { session } = setup();
    expect(() => session.requireRunningController()).toThrow(
      expect.objectContaining({ code: 'BROWSER_NOT_RUNNING' }) as Error,
    );
  });
});
