import { afterEach, describe, expect, it } from 'vitest';

import { createTestAgent } from './testing/create-test-agent.js';

describe('AgentService', () => {
  let agent: ReturnType<typeof createTestAgent>;

  afterEach(() => {
    agent?.database.close();
  });

  it('starts idle with the browser stopped and the extension disconnected', () => {
    agent = createTestAgent();
    expect(agent.service.getStatus()).toEqual({
      agent: 'IDLE',
      browser: 'STOPPED',
      extension: { state: 'DISCONNECTED' },
    });
  });

  it('emits status changes for browser launch and stop', async () => {
    agent = createTestAgent();
    await agent.service.launchBrowser();
    await agent.service.stopBrowser();
    expect(agent.statuses.map((s) => s.browser)).toEqual(['STARTING', 'RUNNING', 'STOPPED']);
  });

  it('reflects task execution in the agent state and notifies the extension', async () => {
    agent = createTestAgent();
    await agent.service.launchBrowser();

    await agent.service.runTask('Open wikipedia.org');
    const running = agent.statuses.find((s) => s.agent === 'RUNNING');
    expect(running?.currentTask).toMatchObject({
      command: 'Open wikipedia.org',
      status: 'RUNNING',
    });
    expect(agent.service.getStatus()).toMatchObject({ agent: 'IDLE' });
    expect(agent.service.getStatus().currentTask).toBeUndefined();

    const failed = await agent.service.runTask('Do something impossible');
    expect(failed.status).toBe('FAILED');
    expect(agent.service.getStatus().agent).toBe('ERROR');

    await agent.service.runTask('Open wikipedia.org');
    expect(agent.service.getStatus().agent).toBe('IDLE');

    expect(agent.extension.notifications.map((n) => n.status)).toEqual([
      'PENDING',
      'RUNNING',
      'COMPLETED',
      'PENDING',
      'RUNNING',
      'FAILED',
      'PENDING',
      'RUNNING',
      'COMPLETED',
    ]);
  });

  it('tracks the extension connection, active page and records events', () => {
    agent = createTestAgent();
    const { extension, service, database } = agent;
    extension.connect('1.2.3');
    extension.changePage({ title: 'Wikipedia', url: 'https://www.wikipedia.org/' });
    extension.changePage({ title: 'Wikipedia', url: 'https://www.wikipedia.org/' }); // duplicate

    expect(service.getStatus().extension).toEqual({
      state: 'CONNECTED',
      extensionVersion: '1.2.3',
      connectedAt: '2026-09-13T00:00:00.000Z',
      activePage: { title: 'Wikipedia', url: 'https://www.wikipedia.org/' },
    });

    extension.disconnect();
    expect(service.getStatus().extension).toEqual({ state: 'DISCONNECTED' });
    expect(
      database.browserEvents
        .listRecent(10)
        .map((e) => e.eventType)
        .reverse(),
    ).toEqual(['EXTENSION_CONNECTED', 'PAGE_CHANGED', 'EXTENSION_DISCONNECTED']);
  });

  it('shuts down in steps: refuses new work, then the browser can still be stopped', async () => {
    agent = createTestAgent();
    const { service, controller } = agent;
    await service.launchBrowser();
    await service.stopAcceptingTasks();
    await service.stopAcceptingTasks(); // idempotent

    expect(service.getStatus()).toMatchObject({ agent: 'STOPPED', browser: 'RUNNING' });
    expect(() => service.launchBrowser()).toThrow(
      expect.objectContaining({ code: 'SHUTTING_DOWN' }) as Error,
    );
    expect(() => service.runTask('Open wikipedia.org')).toThrow(
      expect.objectContaining({ code: 'SHUTTING_DOWN' }) as Error,
    );

    await service.stopBrowser();
    service.dispose();
    expect(service.getStatus().browser).toBe('STOPPED');
    expect(controller.calls.at(-1)).toEqual(['close']);
  });
});
