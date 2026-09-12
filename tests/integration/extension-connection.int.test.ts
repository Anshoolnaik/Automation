import path from 'node:path';

import type { ExtensionToDesktopMessage } from '@atlas/agent-protocol';
import { AgentServer } from '@atlas/agent-server';
import { createNoopLogger } from '@atlas/logger';
import type { BrowserContext } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTempDir, shouldSkipBrowserTests, useHeadless } from './support/environment.js';
import { buildExtension, launchChromeWithExtension } from './support/extension.js';
import { getFreePort } from './support/ports.js';
import { startTestSite, type TestSite } from './support/test-site.js';

/**
 * The real extension in real Google Chrome, talking to the real AgentServer.
 * Covers acceptance tests C (extension connects) and F (reconnects after Atlas restarts).
 */
describe.skipIf(shouldSkipBrowserTests())('Atlas extension <-> agent server (real Chrome)', () => {
  let temp: Awaited<ReturnType<typeof createTempDir>>;
  let site: TestSite;
  let port: number;
  let context: BrowserContext;
  let extensionId: string;
  let server: AgentServer | undefined;
  const messages: ExtensionToDesktopMessage[] = [];

  const startServer = async () => {
    server = new AgentServer({ port, logger: createNoopLogger() });
    server.onMessage((message) => messages.push(message));
    await server.start();
    return server;
  };

  beforeAll(async () => {
    temp = await createTempDir('extension');
    site = await startTestSite();
    port = await getFreePort();
    const extensionDir = path.join(temp.dir, 'extension');
    await buildExtension(extensionDir, port);
    ({ context, extensionId } = await launchChromeWithExtension({
      profileDir: path.join(temp.dir, 'profile'),
      extensionDir,
      headless: useHeadless(),
    }));
  });

  afterAll(async () => {
    await server?.stop();
    await context?.close();
    await site?.close();
    await temp?.cleanup();
  });

  it('connects automatically once the desktop agent becomes available', async () => {
    // The extension started before the server existed and has been retrying.
    const agent = await startServer();
    await expect.poll(() => agent.connection.state, { timeout: 30_000 }).toBe('CONNECTED');
    expect(agent.connection.extensionVersion).toBe('0.1.0');
  });

  it('returns active tab metadata on request and reports page changes', async () => {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`${site.origin}/`);
    await page.bringToFront();

    await expect
      .poll(async () => (await server!.requestPageMetadata())?.title, { timeout: 15_000 })
      .toBe('Atlas Test Page');
    const tab = await server!.requestPageMetadata();
    expect(tab).toMatchObject({ url: `${site.origin}/`, status: 'complete', incognito: false });

    await page.goto(`${site.origin}/remember`);
    await expect
      .poll(
        () =>
          messages.some(
            (m) => m.type === 'PAGE_CHANGED' && m.payload.tab.url === `${site.origin}/remember`,
          ),
        { timeout: 15_000 },
      )
      .toBe(true);
  });

  it('shows the connection state and current page in the popup', async () => {
    server!.send({
      v: 1,
      id: 'task-status-1',
      sentAt: new Date().toISOString(),
      type: 'TASK_STATUS',
      payload: { taskId: 't1', status: 'COMPLETED', command: 'Open wikipedia.org' },
    });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
    await expect.poll(() => popup.locator('#connection').textContent()).toBe('Connected');
    await expect
      .poll(() => popup.locator('#task').textContent())
      .toBe('COMPLETED: Open wikipedia.org');
    expect(await popup.locator('#page-url').textContent()).toContain('chrome-extension://');
    await popup.close();
  });

  it('reconnects after the desktop agent restarts', async () => {
    await server!.stop();
    expect(server!.connection.state).toBe('DISCONNECTED');

    const restarted = await startServer();
    await expect.poll(() => restarted.connection.state, { timeout: 45_000 }).toBe('CONNECTED');
  });
});
