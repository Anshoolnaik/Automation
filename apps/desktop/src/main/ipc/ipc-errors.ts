import { sanitizeErrorMessage } from '@atlas/logger';

import type { IpcError, IpcErrorCode, IpcResult } from '../../shared/ipc-types.js';

/** Domain error codes that are meaningful to the renderer and passed through unchanged. */
const PASSTHROUGH_CODES: ReadonlySet<string> = new Set<IpcErrorCode>([
  'BROWSER_NOT_RUNNING',
  'BROWSER_LAUNCH_FAILED',
  'TASK_REJECTED',
  'SHUTTING_DOWN',
]);

/** Search-planning error codes, translated into the renderer's vocabulary. */
const TRANSLATED_CODES: Readonly<Record<string, IpcErrorCode>> = {
  SEARCH_INTENT_INVALID: 'INVALID_REQUEST',
  CAMPAIGN_INVALID: 'INVALID_REQUEST',
  SOURCE_UNAVAILABLE: 'INVALID_REQUEST',
  CAMPAIGN_NOT_FOUND: 'NOT_FOUND',
  JOB_NOT_FOUND: 'NOT_FOUND',
  INVALID_CAMPAIGN_STATE: 'INVALID_STATE',
  CAMPAIGN_BUSY: 'INVALID_STATE',
  INVALID_JOB_STATE: 'INVALID_STATE',
  MAX_ATTEMPTS_EXCEEDED: 'INVALID_STATE',
};

function isPassthroughCode(code: string | undefined): code is IpcErrorCode {
  return code !== undefined && PASSTHROUGH_CODES.has(code);
}

export function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

export function fail(code: IpcErrorCode, message: string): IpcResult<never> {
  return { ok: false, error: { code, message } };
}

/** Converts any thrown value into a sanitized, serializable IPC error. */
export function toIpcError(error: unknown): IpcError {
  const code = readErrorCode(error);
  return {
    code: isPassthroughCode(code)
      ? code
      : ((code !== undefined ? TRANSLATED_CODES[code] : undefined) ?? 'INTERNAL_ERROR'),
    message: sanitizeErrorMessage(error),
  };
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : undefined;
  }
  return undefined;
}
