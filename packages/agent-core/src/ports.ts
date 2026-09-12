/**
 * Ports: interfaces agent-core needs from the outside world. Implementations
 * (SQLite, WebSocket…) are injected by the application's composition root.
 */

export type BrowserEventType =
  | 'BROWSER_LAUNCHED'
  | 'BROWSER_LAUNCH_FAILED'
  | 'BROWSER_STOPPED'
  | 'BROWSER_DISCONNECTED'
  | 'ACTION_STARTED'
  | 'ACTION_COMPLETED'
  | 'ACTION_FAILED'
  | 'PAGE_CHANGED'
  | 'EXTENSION_CONNECTED'
  | 'EXTENSION_DISCONNECTED';

export interface BrowserEventInput {
  type: BrowserEventType;
  taskId?: string;
  url?: string;
  details?: Record<string, unknown>;
}

export interface BrowserEventRecorder {
  record(event: BrowserEventInput): void;
}

export const noopBrowserEventRecorder: BrowserEventRecorder = {
  record: () => undefined,
};
