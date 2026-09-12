import { sanitizeErrorMessage } from '@atlas/logger';

import type { IpcError, IpcErrorCode, IpcResult } from '../../shared/ipc-types.js';

/** Domain error codes that are meaningful to the renderer and passed through unchanged. */
const PASSTHROUGH_CODES: ReadonlySet<string> = new Set<IpcErrorCode>([
  'BROWSER_NOT_RUNNING',
  'BROWSER_LAUNCH_FAILED',
  'TASK_REJECTED',
  'SHUTTING_DOWN',
]);

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
    code: isPassthroughCode(code) ? code : 'INTERNAL_ERROR',
    message: sanitizeErrorMessage(error),
  };
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : undefined;
  }
  return undefined;
}
