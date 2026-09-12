/**
 * The complete, whitelisted set of IPC channels between renderer and main.
 * Nothing outside these constants may be sent over IPC.
 */

/** Renderer -> main request/response channels (ipcRenderer.invoke / ipcMain.handle). */
export const IpcChannel = {
  BrowserLaunch: 'browser:launch',
  BrowserStop: 'browser:stop',
  TaskRun: 'task:run',
  AgentGetStatus: 'agent:get-status',
  ExtensionGetStatus: 'extension:get-status',
  LogsSubscribe: 'logs:subscribe',
} as const;

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel];

/** Main -> renderer push channels (webContents.send / ipcRenderer.on). */
export const IpcEvent = {
  StatusChanged: 'agent:status-changed',
  LogEntry: 'logs:entry',
} as const;

export type IpcEvent = (typeof IpcEvent)[keyof typeof IpcEvent];
