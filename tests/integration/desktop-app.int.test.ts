import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { openAtlasDatabase } from '@atlas/database';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { launchDesktopApp, isDesktopBuilt, type LaunchedDesktop } from './support/desktop-app.js';
import { createTempDir, shouldSkipBrowserTests } from './support/environment.js';
import { getFreePort } from './support/ports.js';
import { startTestSite, type TestSite } from './support/test-site.js';

/**
 * Drives the real, built Electron app (run `pnpm build` first) against a local
 * test site, so no internet access is needed. Covers acceptance tests A, B, D
 * (task execution, activity log, SQLite) and E (profile reuse across restarts).
 */
describe.skipIf(shouldSkipBrowserTests() || !isDesktopBuilt())(
  'Atlas desktop app (Electron)',
  () => {
    let site: TestSite;
    let userData: Awaited<ReturnType<typeof createTempDir>>;
    let desktop: LaunchedDesktop | undefined;

    beforeAll(async () => {
      site = await startTestSite();
    });

    afterAll(async () => {
      await site.close();
    });

    beforeEach(async () => {
      userData = await createTempDir('userdata');
    });

    afterEach(async () => {
      await desktop?.app.close().catch(() => undefined);
      desktop = undefined;
      await userData.cleanup();
    });

    const start = async () => {
      desktop = await launchDesktopApp({
        userDataDir: userData.dir,
        agentPort: await getFreePort(),
      });
      return desktop.window;
    };

    const stop = async () => {
      await desktop?.app.close();
      desktop = undefined;
    };

    const statusOf = (id: 'agent' | 'browser' | 'extension') =>
      desktop!.window.getByTestId(`status-${id}-value`);

    const launchBrowser = async () => {
      await desktop!.window.getByRole('button', { name: 'Launch Agent Browser' }).click();
      await expect
        .poll(() => statusOf('browser').textContent(), { timeout: 60_000 })
        .toBe('Running');
    };

    const runTask = async (command: string) => {
      const { window } = desktop!;
      const notice = window.locator('.notice');
      const noticeText = async () =>
        (await notice.count()) > 0 ? ((await notice.first().textContent()) ?? '') : '';
      await window.getByLabel('What should Atlas do?').fill(command);
      await window.getByRole('button', { name: 'Run Task' }).click();
      // The button is disabled while the task runs; wait for it to finish, then read the result.
      await expect
        .poll(() => window.getByRole('button', { name: 'Running…' }).count(), { timeout: 60_000 })
        .toBe(0);
      await expect.poll(noticeText, { timeout: 10_000 }).not.toBe('');
      return noticeText();
    };

    it('starts idle, launches Chrome, runs a task, stops and shuts down gracefully', async () => {
      const window = await start();

      // TEST A
      await expect.poll(() => statusOf('agent').textContent()).toBe('Idle');
      expect(await statusOf('browser').textContent()).toBe('Not Running');
      expect(await statusOf('extension').textContent()).toBe('Disconnected');
      expect(await window.getByRole('button', { name: 'Run Task' }).isDisabled()).toBe(true);
      expect(
        await window.evaluate(() => typeof (globalThis as { require?: unknown }).require),
      ).toBe('undefined');

      // TEST B
      await launchBrowser();
      const profileDir = path.join(userData.dir, 'browser-profile');
      await expect.poll(() => existsSync(path.join(profileDir, 'Default'))).toBe(true);

      // TEST D (offline variant): a command runs, is logged and persisted.
      const host = new URL(site.origin).host;
      expect(await runTask(`Open ${site.origin}/`)).toBe('Task completed: Atlas Test Page');
      await expect.poll(() => statusOf('agent').textContent()).toBe('Idle');
      for (const line of [
        `Task received: Open ${site.origin}/`,
        `Opening ${host}`,
        'Task completed: Atlas Test Page',
      ]) {
        await expect.poll(() => window.getByText(line, { exact: true }).count()).toBeGreaterThan(0);
      }

      // An unsupported command fails visibly and puts the agent into ERROR.
      expect(await runTask('Order a pizza')).toContain('only understands a few simple commands');
      await expect.poll(() => statusOf('agent').textContent()).toBe('Error');

      await window.getByRole('button', { name: 'Stop Browser' }).click();
      await expect
        .poll(() => statusOf('browser').textContent(), { timeout: 30_000 })
        .toBe('Not Running');
      await stop();

      const logFile = await readFile(path.join(userData.dir, 'logs', 'atlas.log'), 'utf8');
      expect(logFile).toContain('"message":"Agent started"');
      expect(logFile).toContain('"message":"Agent stopped"');
      expect(existsSync(profileDir)).toBe(true); // never deleted

      const database = openAtlasDatabase({ filePath: path.join(userData.dir, 'data', 'atlas.db') });
      try {
        expect(database.agentRuns.abortUnfinished()).toBe(0); // shut down cleanly
        const [failed, completed] = database.tasks.listRecent(10);
        expect(completed).toMatchObject({ command: `Open ${site.origin}/`, status: 'COMPLETED' });
        expect(failed).toMatchObject({ command: 'Order a pizza', status: 'FAILED' });
        expect(database.browserEvents.listByTask(completed!.id).map((e) => e.eventType)).toEqual([
          'ACTION_STARTED',
          'ACTION_COMPLETED',
        ]);
        expect(database.browserEvents.listRecent(50).map((e) => e.eventType)).toEqual(
          expect.arrayContaining(['BROWSER_LAUNCHED', 'BROWSER_STOPPED']),
        );
      } finally {
        database.close();
      }
    });

    it('reuses the dedicated browser profile after Atlas restarts (TEST E)', async () => {
      await start();
      await launchBrowser();
      expect(await runTask(`Open ${site.origin}/remember`)).toBe('Task completed: Remembered');
      await stop(); // closes Chrome through graceful shutdown

      await start();
      await launchBrowser();
      expect(await runTask(`Open ${site.origin}/recall`)).toBe(
        'Task completed: Recall: still-here',
      );
    });

    it('plans a search campaign, keeps it across restarts and never duplicates jobs (Phase 2)', async () => {
      const metric = async (id: string) =>
        Number(
          ((await desktop!.window.getByTestId(`search-summary-${id}`).textContent()) ?? '').replace(
            /,/g,
            '',
          ),
        );
      const openSearchTab = async () => {
        await desktop!.window.getByRole('tab', { name: 'Search Campaigns' }).click();
      };

      let window = await start();
      await openSearchTab();
      await window.getByRole('button', { name: 'Create Test Campaign' }).click();
      await expect
        .poll(() => window.getByTestId('search-campaign-status').textContent())
        .toBe('Draft');
      await window.getByRole('button', { name: 'Generate Search Plan' }).click();
      await expect
        .poll(() => window.getByTestId('search-campaign-status').textContent(), { timeout: 30_000 })
        .toBe('Planned');

      expect(await metric('countries')).toBe(3);
      const institutions = await metric('institutions');
      const queries = await metric('queries');
      const jobs = await metric('jobs');
      expect(institutions).toBeGreaterThan(0);
      expect(queries).toBeGreaterThan(0);
      expect(jobs).toBe(queries); // one Scribd job per query
      await expect
        .poll(() => window.getByTestId('search-progress-pending').textContent())
        .toBe(String(jobs));
      for (const code of ['CA', 'GB', 'US']) {
        expect(await window.getByTestId(`search-country-${code}`).count()).toBe(1);
      }
      const jobsTable = window.getByRole('table', { name: 'Search jobs' });
      // The first page holds the highest-priority jobs: institution + transcript.
      await expect
        .poll(() =>
          jobsTable.getByText('"University of Toronto" transcript', { exact: true }).count(),
        )
        .toBe(1);
      // Page through the whole table, then look for the other query shapes.
      const showMore = window.getByRole('button', { name: 'Show more jobs' });
      while ((await showMore.count()) > 0) {
        const rows = await jobsTable.locator('tbody tr').count();
        await showMore.click();
        await expect.poll(() => jobsTable.locator('tbody tr').count()).toBeGreaterThan(rows);
      }
      expect(await jobsTable.locator('tbody tr').count()).toBe(jobs);
      for (const text of [
        '"University of Toronto" bachelor transcript',
        '"University of Toronto" statement of results',
        'Canada academic transcript',
        'Canada diploma transcript',
      ]) {
        expect(await jobsTable.getByText(text, { exact: true }).count()).toBe(1);
      }

      // Restart: the campaign and its plan are still there.
      await stop();
      window = await start();
      await openSearchTab();
      await expect
        .poll(() => window.getByTestId('search-campaign-status').textContent(), { timeout: 30_000 })
        .toBe('Planned');
      expect(await metric('jobs')).toBe(jobs);

      // Regenerating the same campaign inserts nothing new.
      await window.getByRole('button', { name: 'Generate Search Plan' }).click();
      await expect
        .poll(() => window.getByTestId('search-notice').textContent(), { timeout: 30_000 })
        .toContain('0 new jobs');
      expect(await metric('jobs')).toBe(jobs);
      expect(await metric('queries')).toBe(queries);

      // Phase-1 agent view still works alongside.
      await window.getByRole('tab', { name: 'Agent' }).click();
      await expect.poll(() => statusOf('agent').textContent()).toBe('Idle');
      await stop();

      const database = openAtlasDatabase({ filePath: path.join(userData.dir, 'data', 'atlas.db') });
      try {
        const [campaign] = database.searchCampaigns.listCampaigns(10);
        expect(campaign).toMatchObject({ name: 'Transcript Search Test', status: 'PLANNED' });
        expect(database.searchJobs.countJobs(campaign!.id)).toBe(jobs);
        expect(database.searchQueries.countQueries(campaign!.id)).toBe(queries);
        const hashes = database.searchQueries
          .listQueries(campaign!.id, { limit: 1_000, offset: 0 })
          .map((query) => query.queryHash);
        expect(new Set(hashes).size).toBe(queries);
      } finally {
        database.close();
      }
    });
  },
);
