import { describe, expect, it } from 'vitest';

import { BrowserError } from '../errors.js';
import {
  CHROME_NOT_FOUND_MESSAGE,
  PROFILE_IN_USE_MESSAGE,
  mapLaunchError,
  mapOperationError,
} from './error-mapping.js';
import { buildPersistentLaunchOptions } from './launch-options.js';

describe('mapLaunchError', () => {
  it('explains a missing Chrome installation', () => {
    const error = mapLaunchError(
      new Error(
        'browserType.launchPersistentContext: Chromium distribution \'chrome\' is not found at C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\nRun "npx playwright install chrome"',
      ),
    );
    expect(error).toMatchObject({ code: 'CHROME_NOT_FOUND', message: CHROME_NOT_FOUND_MESSAGE });
  });

  it('explains a locked profile', () => {
    const error = mapLaunchError(
      new Error(
        'Opening in existing browser session. This usually means that the profile is already in use',
      ),
    );
    expect(error).toMatchObject({ code: 'PROFILE_IN_USE', message: PROFILE_IN_USE_MESSAGE });
  });

  it('wraps anything else as LAUNCH_FAILED with a sanitized message', () => {
    const error = mapLaunchError(new Error('boom\n=== logs ===\nsecret stuff'));
    expect(error).toBeInstanceOf(BrowserError);
    expect(error.code).toBe('LAUNCH_FAILED');
    expect(error.message).toBe('Chrome failed to start: boom');
  });
});

describe('mapOperationError', () => {
  it('recognizes timeouts', () => {
    const timeout = Object.assign(new Error('locator.fill: Timeout 15000ms exceeded.'), {
      name: 'TimeoutError',
    });
    expect(mapOperationError(timeout, 'type')).toMatchObject({
      code: 'TIMEOUT',
      operation: 'type',
    });
  });

  it('recognizes a closed browser', () => {
    expect(
      mapOperationError(
        new Error('page.goto: Target page, context or browser has been closed'),
        'goto',
      ),
    ).toMatchObject({ code: 'BROWSER_NOT_RUNNING' });
  });

  it('recognizes network navigation failures', () => {
    expect(
      mapOperationError(
        new Error('page.goto: net::ERR_NAME_NOT_RESOLVED at https://nope.invalid/'),
        'goto',
      ),
    ).toMatchObject({
      code: 'NAVIGATION_FAILED',
      message: 'Navigation failed (net::ERR_NAME_NOT_RESOLVED)',
    });
  });

  it('passes BrowserErrors through unchanged', () => {
    const original = new BrowserError('INVALID_URL', 'bad', 'goto');
    expect(mapOperationError(original, 'goto')).toBe(original);
  });
});

describe('buildPersistentLaunchOptions', () => {
  it('prefers installed Google Chrome and keeps normal Chrome protections', () => {
    const options = buildPersistentLaunchOptions({ launchTimeoutMs: 1000 });
    expect(options.channel).toBe('chrome');
    expect(options.executablePath).toBeUndefined();
    expect(options.headless).toBe(false);
    expect(options.viewport).toBeNull();
    expect(options.ignoreDefaultArgs).toEqual(
      expect.arrayContaining([
        '--disable-extensions',
        '--use-mock-keychain',
        '--password-store=basic',
      ]),
    );
  });

  it('uses an explicit executable instead of the channel', () => {
    const options = buildPersistentLaunchOptions({
      launchTimeoutMs: 1000,
      executablePath: '/opt/google/chrome/chrome',
      extraArgs: ['--lang=en-US'],
    });
    expect(options.channel).toBeUndefined();
    expect(options.executablePath).toBe('/opt/google/chrome/chrome');
    expect(options.args).toEqual(['--lang=en-US']);
  });
});
