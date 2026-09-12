import { sanitizeErrorMessage } from '@atlas/logger';

import { BrowserError } from '../errors.js';

const CHROME_NOT_FOUND_PATTERN =
  /distribution '[^']+' is not found|executable doesn't exist|spawn .* ENOENT|Failed to launch .* ENOENT/i;
const PROFILE_IN_USE_PATTERN =
  /ProcessSingleton|Opening in existing browser session|profile is already in use|exitCode=21/i;
const CLOSED_PATTERN =
  /Target page, context or browser has been closed|Browser has been closed|Target closed|browser has disconnected/i;
const NAVIGATION_PATTERN = /net::ERR_[A-Z_]+/;

export const CHROME_NOT_FOUND_MESSAGE =
  'Google Chrome was not found. Install Google Chrome from https://www.google.com/chrome/ ' +
  'or set ATLAS_CHROME_EXECUTABLE to the full path of the Chrome executable.';

export const PROFILE_IN_USE_MESSAGE =
  'The Atlas browser profile is already in use by another Chrome window. ' +
  'Close any Chrome window that was opened with the Atlas profile and try again.';

export function mapLaunchError(error: unknown): BrowserError {
  if (error instanceof BrowserError) return error;
  const message = rawMessage(error);
  if (CHROME_NOT_FOUND_PATTERN.test(message)) {
    return new BrowserError('CHROME_NOT_FOUND', CHROME_NOT_FOUND_MESSAGE, 'launch', {
      cause: error,
    });
  }
  if (PROFILE_IN_USE_PATTERN.test(message)) {
    return new BrowserError('PROFILE_IN_USE', PROFILE_IN_USE_MESSAGE, 'launch', { cause: error });
  }
  return new BrowserError(
    'LAUNCH_FAILED',
    `Chrome failed to start: ${sanitizeErrorMessage(error)}`,
    'launch',
    { cause: error },
  );
}

export function mapOperationError(error: unknown, operation: string): BrowserError {
  if (error instanceof BrowserError) return error;
  const message = rawMessage(error);
  const summary = sanitizeErrorMessage(error);

  if (isTimeoutError(error)) {
    return new BrowserError('TIMEOUT', `${operation} timed out: ${summary}`, operation, {
      cause: error,
    });
  }
  if (CLOSED_PATTERN.test(message)) {
    return new BrowserError(
      'BROWSER_NOT_RUNNING',
      'The Agent Browser is no longer running',
      operation,
      {
        cause: error,
      },
    );
  }
  const navigationCode = NAVIGATION_PATTERN.exec(message)?.[0];
  if (navigationCode) {
    return new BrowserError(
      'NAVIGATION_FAILED',
      `Navigation failed (${navigationCode})`,
      operation,
      {
        cause: error,
      },
    );
  }
  return new BrowserError('OPERATION_FAILED', `${operation} failed: ${summary}`, operation, {
    cause: error,
  });
}

/** Playwright's TimeoutError, detected by name so this module stays unit-testable. */
export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

function rawMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
