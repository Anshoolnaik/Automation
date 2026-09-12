import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { launchDesktopApp, isDesktopBuilt, type LaunchedDesktop } from './support/desktop-app.js';
import { createTempDir, shouldSkipBrowserTests } from './support/environment.js';
import { getFreePort } from './support/ports.js';

/**
 * Drives the real, built Electron app (run `pnpm build` first).
 * Covers acceptance tests A and B from the Phase-1 checklist.
 */
describe.skipIf(shouldSkipBrowserTests() || !isDesktopBuilt())(
  'Atlas desktop app (Electron)',
  () => {
    let userData: Awaited<ReturnType<typeof createTempDir>>;
    let desktop: LaunchedDesktop | undefined;

    beforeEach(async () => {
      userData = await createTempDir('userdata');
    });

    afterEach(async () => {
      await desktop?.app.close().catch(() => undefined);
      desktop = undefined;
      await userData.cleanup();
    });

    const statusOf = (id: 'agent' | 'browser' | 'extension') =>
      desktop!.window.getByTestId(`status-${id}-value`);

    it('starts idle, launches Chrome with the dedicated profile, stops and shuts down gracefully', async () => {
      desktop = await launchDesktopApp({
        userDataDir: userData.dir,
        agentPort: await getFreePort(),
      });
      const { window } = desktop;

      // TEST A
      await expect.poll(() => statusOf('agent').textContent()).toBe('Idle');
      expect(await statusOf('browser').textContent()).toBe('Not Running');
      expect(await statusOf('extension').textContent()).toBe('Disconnected');
      expect(await window.getByRole('button', { name: 'Run Task' }).isDisabled()).toBe(true);

      // The renderer is isolated from Node.
      expect(
        await window.evaluate(() => typeof (globalThis as { require?: unknown }).require),
      ).toBe('undefined');

      // TEST B
      await window.getByRole('button', { name: 'Launch Agent Browser' }).click();
      await expect
        .poll(() => statusOf('browser').textContent(), { timeout: 60_000 })
        .toBe('Running');
      const profileDir = path.join(userData.dir, 'browser-profile');
      await expect.poll(() => existsSync(path.join(profileDir, 'Default'))).toBe(true);
      await expect.poll(() => window.getByText('Browser launched').count()).toBeGreaterThan(0);

      await window.getByRole('button', { name: 'Stop Browser' }).click();
      await expect
        .poll(() => statusOf('browser').textContent(), { timeout: 30_000 })
        .toBe('Not Running');

      await desktop.app.close();
      desktop = undefined;

      const logFile = await readFile(path.join(userData.dir, 'logs', 'atlas.log'), 'utf8');
      expect(logFile).toContain('"message":"Agent started"');
      expect(logFile).toContain('"message":"Agent stopped"');
      // Profile data is never deleted on shutdown.
      expect(existsSync(profileDir)).toBe(true);
    });
  },
);
