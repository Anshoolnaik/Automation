import type { TaskStatus } from '@atlas/agent-protocol';

/**
 * Messages between the popup and the service worker (chrome.runtime messaging).
 * These never leave the extension; the desktop protocol lives in @atlas/agent-protocol.
 */

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface PopupState {
  connection: ConnectionStatus;
  agentUrl: string;
  currentPage: { title: string; url: string } | null;
  lastTask: { command: string; status: TaskStatus; message?: string } | null;
}

export const GET_STATE = 'atlas:get-state';
export const STATE_CHANGED = 'atlas:state-changed';

export interface GetStateRequest {
  kind: typeof GET_STATE;
}

export interface StateChangedBroadcast {
  kind: typeof STATE_CHANGED;
  state: PopupState;
}

export function isGetStateRequest(value: unknown): value is GetStateRequest {
  return (
    typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === GET_STATE
  );
}

export function isStateChangedBroadcast(value: unknown): value is StateChangedBroadcast {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === STATE_CHANGED &&
    typeof (value as { state?: unknown }).state === 'object'
  );
}
