export type BrowserErrorCode =
  | 'CHROME_NOT_FOUND'
  | 'PROFILE_IN_USE'
  | 'LAUNCH_FAILED'
  | 'BROWSER_NOT_RUNNING'
  | 'INVALID_URL'
  | 'INVALID_ARGUMENT'
  | 'NAVIGATION_FAILED'
  | 'TIMEOUT'
  | 'OPERATION_FAILED';

export class BrowserError extends Error {
  override readonly name = 'BrowserError';

  constructor(
    readonly code: BrowserErrorCode,
    message: string,
    readonly operation: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export function isBrowserError(error: unknown): error is BrowserError {
  return error instanceof BrowserError;
}
