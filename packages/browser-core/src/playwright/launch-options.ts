import type { BrowserContextOptions, LaunchOptions } from 'playwright-core';

export type PersistentLaunchOptions = LaunchOptions & BrowserContextOptions;

export interface LaunchOptionsInput {
  /** Explicit browser executable. When absent, installed Google Chrome (`channel: "chrome"`) is used. */
  executablePath?: string | undefined;
  headless?: boolean;
  launchTimeoutMs: number;
  /** Additional Chrome switches (e.g. used by tests). */
  extraArgs?: readonly string[];
}

/**
 * Playwright defaults that would weaken a real user's browser profile. Atlas
 * drives a genuine, persistent Chrome session, so it keeps Chrome's normal
 * protections: extensions allowed (the Atlas extension), OS-backed cookie
 * encryption instead of a mock keychain, phishing detection and popup blocking.
 */
export const RESTORED_CHROME_DEFAULTS: readonly string[] = [
  '--disable-extensions',
  '--password-store=basic',
  '--use-mock-keychain',
  '--disable-client-side-phishing-detection',
  '--disable-popup-blocking',
];

export function buildPersistentLaunchOptions(input: LaunchOptionsInput): PersistentLaunchOptions {
  const options: PersistentLaunchOptions = {
    headless: input.headless ?? false,
    // Use the real window size instead of an emulated viewport.
    viewport: null,
    timeout: input.launchTimeoutMs,
    ignoreDefaultArgs: [...RESTORED_CHROME_DEFAULTS],
    args: [...(input.extraArgs ?? [])],
    // Electron owns process signals and performs an orderly shutdown.
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  };
  if (input.executablePath) {
    options.executablePath = input.executablePath;
  } else {
    options.channel = 'chrome';
  }
  return options;
}
