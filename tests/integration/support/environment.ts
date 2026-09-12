import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Browser suites are skipped when ATLAS_SKIP_BROWSER_TESTS=1, or in CI unless
 * ATLAS_RUN_BROWSER_TESTS=1 explicitly opts in (CI images rarely ship Chrome).
 */
export function shouldSkipBrowserTests(): boolean {
  if (process.env.ATLAS_SKIP_BROWSER_TESTS === '1') return true;
  if (process.env.CI && process.env.ATLAS_RUN_BROWSER_TESTS !== '1') return true;
  return false;
}

/** Headed by default so behaviour matches the real app; set ATLAS_HEADLESS=1 for headless runs. */
export function useHeadless(): boolean {
  return process.env.ATLAS_HEADLESS === '1';
}

export async function createTempDir(
  prefix: string,
): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), `atlas-${prefix}-`));
  return {
    dir,
    // Chrome may hold file handles briefly after exit on Windows; retry removal.
    cleanup: () => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }),
  };
}
