import path from 'node:path';

import { openAtlasDatabase } from '@atlas/database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { launchDesktopApp, isDesktopBuilt, type LaunchedDesktop } from './support/desktop-app.js';
import { createTempDir, shouldSkipBrowserTests } from './support/environment.js';
import { getFreePort } from './support/ports.js';

/**
 * TEST D against the real Wikipedia. Needs internet access, so it only runs
 * with ATLAS_RUN_NETWORK_TESTS=1. Wikipedia can change its markup; a failure
 * here may mean the Phase-1 demo selectors need updating.
 */
const runNetworkTests = process.env.ATLAS_RUN_NETWORK_TESTS === '1';

describe.skipIf(shouldSkipBrowserTests() || !isDesktopBuilt() || !runNetworkTests)(
  'Phase-1 Wikipedia demo (network)',
  () => {
    let userData: Awaited<ReturnType<typeof createTempDir>>;
    let desktop: LaunchedDesktop | undefined;

    beforeEach(async () => {
      userData = await createTempDir('wikipedia');
    });

    afterEach(async () => {
      await desktop?.app.close().catch(() => undefined);
      await userData.cleanup();
    });

    it('opens wikipedia.org and searches for Alan Turing', async () => {
      desktop = await launchDesktopApp({
        userDataDir: userData.dir,
        agentPort: await getFreePort(),
      });
      const { window } = desktop;

      await window.getByRole('button', { name: 'Launch Agent Browser' }).click();
      await expect
        .poll(() => window.getByTestId('status-browser-value').textContent(), { timeout: 60_000 })
        .toBe('Running');

      await window
        .getByLabel('What should Atlas do?')
        .fill('Open wikipedia.org and search for Alan Turing');
      await window.getByRole('button', { name: 'Run Task' }).click();

      const notice = window.locator('.notice');
      await expect.poll(() => notice.count(), { timeout: 90_000 }).toBeGreaterThan(0);
      expect(await notice.textContent()).toMatch(/^Task completed: .*Alan Turing/);
      for (const line of [
        'Opening wikipedia.org',
        'Searching for Alan Turing',
        'Submitting search',
      ]) {
        expect(await window.getByText(line, { exact: true }).count()).toBeGreaterThan(0);
      }

      await desktop.app.close();
      desktop = undefined;

      const database = openAtlasDatabase({ filePath: path.join(userData.dir, 'data', 'atlas.db') });
      try {
        const [task] = database.tasks.listRecent(1);
        expect(task).toMatchObject({
          command: 'Open wikipedia.org and search for Alan Turing',
          status: 'COMPLETED',
        });
        const events = database.browserEvents.listByTask(task!.id);
        expect(events.filter((e) => e.eventType === 'ACTION_COMPLETED')).toHaveLength(3);
        expect(events.at(-1)?.url).toMatch(/wikipedia\.org\/wiki\/Alan_Turing/);
      } finally {
        database.close();
      }
    });
  },
);
