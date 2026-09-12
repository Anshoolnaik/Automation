import type { AtlasApi, IpcResult } from '../../shared/ipc-types';

declare global {
  interface Window {
    /** Exposed by the preload script via contextBridge. */
    readonly atlas: AtlasApi;
  }
}

export function getAtlasApi(): AtlasApi {
  return window.atlas;
}

/** Returns the error message of a failed result, or undefined on success. */
export function resultError(result: IpcResult<unknown>): string | undefined {
  return result.ok ? undefined : result.error.message;
}
