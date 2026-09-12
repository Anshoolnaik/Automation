import { createNoopLogger } from '@atlas/logger';
import { describe, expect, it } from 'vitest';

import { AgentService } from './agent-service.js';
import type { AgentStatus } from './agent-status.js';
import { BrowserSession } from './browser/browser-session.js';
import type { BrowserEventInput } from './ports.js';
import { FakeBrowserController } from './testing/fake-browser-controller.js';
import { FakeExtensionChannel } from './testing/fake-extension-channel.js';

function setup() {
  const controller = new FakeBrowserController();
  const extension = new FakeExtensionChannel();
  const events: BrowserEventInput[] = [];
  const recorder = { record: (event: BrowserEventInput) => events.push(event) };
  const browser = new BrowserSession(controller, createNoopLogger(), recorder);
  const service = new AgentService({
    browser,
    extension,
    events: recorder,
    logger: createNoopLogger(),
  });
  const statuses: AgentStatus[] = [];
  service.onStatusChanged((status) => statuses.push(status));
  return { controller, extension, events, service, statuses };
}

describe('AgentService', () => {
  it('starts idle with the browser stopped and the extension disconnected', () => {
    const { service } = setup();
    expect(service.getStatus()).toEqual({
      agent: 'IDLE',
      browser: 'STOPPED',
      extension: { state: 'DISCONNECTED' },
    });
  });

  it('emits status changes for browser launch and stop', async () => {
    const { service, statuses } = setup();
    await service.launchBrowser();
    await service.stopBrowser();
    expect(statuses.map((s) => s.browser)).toEqual(['STARTING', 'RUNNING', 'STOPPED']);
  });

  it('tracks the extension connection, active page and records events', () => {
    const { service, extension, events } = setup();
    extension.connect('1.2.3');
    extension.changePage({ title: 'Wikipedia', url: 'https://www.wikipedia.org/' });
    extension.changePage({ title: 'Wikipedia', url: 'https://www.wikipedia.org/' }); // duplicate: ignored

    expect(service.getStatus().extension).toEqual({
      state: 'CONNECTED',
      extensionVersion: '1.2.3',
      connectedAt: '2026-09-13T00:00:00.000Z',
      activePage: { title: 'Wikipedia', url: 'https://www.wikipedia.org/' },
    });

    extension.disconnect();
    expect(service.getStatus().extension).toEqual({ state: 'DISCONNECTED' });
    expect(events.map((e) => e.type)).toEqual([
      'EXTENSION_CONNECTED',
      'PAGE_CHANGED',
      'EXTENSION_DISCONNECTED',
    ]);
  });

  it('shuts down in steps: refuses new work, then the browser can still be stopped', async () => {
    const { service, controller } = setup();
    await service.launchBrowser();
    await service.stopAcceptingTasks();
    await service.stopAcceptingTasks(); // idempotent

    expect(service.getStatus()).toMatchObject({ agent: 'STOPPED', browser: 'RUNNING' });
    expect(() => service.launchBrowser()).toThrow(
      expect.objectContaining({ code: 'SHUTTING_DOWN' }) as Error,
    );

    await service.stopBrowser();
    service.dispose();
    expect(service.getStatus().browser).toBe('STOPPED');
    expect(controller.calls.at(-1)).toEqual(['close']);
  });
});
