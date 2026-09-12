import { BrowserError, executeBrowserAction } from '@atlas/browser-core';
import { PlaywrightBrowserController } from '@atlas/browser-core/playwright';
import { createLogManager, MemoryTransport } from '@atlas/logger';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTempDir, shouldSkipBrowserTests, useHeadless } from './support/environment.js';
import { startTestSite, type TestSite } from './support/test-site.js';

describe.skipIf(shouldSkipBrowserTests())('PlaywrightBrowserController (real Chrome)', () => {
  let site: TestSite;
  let profile: Awaited<ReturnType<typeof createTempDir>>;
  let logs: MemoryTransport;
  let controller: PlaywrightBrowserController;

  const createController = () =>
    new PlaywrightBrowserController({
      profileDir: profile.dir,
      headless: useHeadless(),
      logger: createLogManager({ transports: [logs], minLevel: 'debug' }).forComponent('browser'),
      timeouts: { actionMs: 10_000, navigationMs: 20_000 },
    });

  beforeAll(async () => {
    site = await startTestSite();
  });

  afterAll(async () => {
    await site.close();
  });

  beforeEach(async () => {
    profile = await createTempDir('profile');
    logs = new MemoryTransport({ capacity: 1_000 });
    controller = createController();
  });

  afterEach(async () => {
    await controller.close();
    await profile.cleanup();
  });

  async function launchOrSkip(context: { skip: (note?: string) => void }) {
    try {
      await controller.launch();
    } catch (error) {
      if (error instanceof BrowserError && error.code === 'CHROME_NOT_FOUND') {
        context.skip('Google Chrome is not installed');
      }
      throw error;
    }
  }

  it('launches Chrome, opens a local page, reads its title and closes', async (context) => {
    await launchOrSkip(context);
    expect(controller.isRunning).toBe(true);

    await controller.goto(`${site.origin}/`);
    expect(await controller.getPageTitle()).toBe('Atlas Test Page');
    expect(await controller.getCurrentUrl()).toBe(`${site.origin}/`);
    expect(await controller.getPageText()).toContain('Atlas integration test');

    await controller.close();
    expect(controller.isRunning).toBe(false);

    const messages = logs.recent().map((entry) => entry.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        'Chrome launched',
        'goto completed',
        'getPageTitle completed',
        'Chrome closed',
      ]),
    );
  });

  it('fills a form, presses Enter and waits for the resulting navigation', async (context) => {
    await launchOrSkip(context);
    await executeBrowserAction(controller, { type: 'navigate', url: `${site.origin}/` });
    await executeBrowserAction(controller, {
      type: 'fill',
      selector: '#search',
      value: 'Alan Turing',
    });
    await executeBrowserAction(controller, { type: 'press', selector: '#search', key: 'Enter' });

    expect(await controller.getCurrentUrl()).toBe(`${site.origin}/results?q=Alan+Turing`);
    await expect.poll(() => controller.getPageTitle()).toBe('Results for Alan Turing');
    await controller.scroll('down', 400);

    // Typed text must never reach the logs.
    expect(JSON.stringify(logs.recent())).not.toContain('Alan Turing');
  });

  it('reports structured errors for bad input and missing elements', async (context) => {
    await launchOrSkip(context);
    await controller.goto(`${site.origin}/`);

    await expect(controller.goto('file:///etc/passwd')).rejects.toMatchObject({
      code: 'INVALID_URL',
    });
    const fast = new PlaywrightBrowserController({
      profileDir: profile.dir,
      logger: createLogManager({ transports: [] }).forComponent('x'),
    });
    await expect(fast.getPageTitle()).rejects.toMatchObject({ code: 'BROWSER_NOT_RUNNING' });
    await expect(controller.click('#does-not-exist')).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('keeps profile data across browser restarts (persistent context)', async (context) => {
    await launchOrSkip(context);
    await controller.goto(`${site.origin}/remember`);
    expect(await controller.getPageTitle()).toBe('Remembered');
    await controller.close();

    controller = createController();
    await controller.launch();
    await controller.goto(`${site.origin}/recall`);
    expect(await controller.getPageTitle()).toBe('Recall: still-here');
  });

  it('explains when the profile is already open in another Chrome', async (context) => {
    await launchOrSkip(context);
    const second = createController();
    await expect(second.launch()).rejects.toMatchObject({
      code: 'PROFILE_IN_USE',
      message: expect.stringContaining('already in use') as string,
    });
    expect(second.isRunning).toBe(false);
    expect(controller.isRunning).toBe(true);
  });

  it('notifies listeners when Chrome is closed outside Atlas', async (context) => {
    await launchOrSkip(context);
    let disconnected = false;
    controller.onDisconnected(() => {
      disconnected = true;
    });
    await controller.goto(`${site.origin}/`);

    // Simulate the user closing the browser: close the underlying context without controller.close().
    const internal = controller as unknown as { context: { close(): Promise<void> } };
    await internal.context.close();

    await expect.poll(() => disconnected).toBe(true);
    expect(controller.isRunning).toBe(false);
  });
});
