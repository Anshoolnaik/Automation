import type { AgentState, BrowserState, ExtensionState, TaskStatus } from '@atlas/agent-protocol';

/** Every IPC response is an explicit result so errors never rely on Electron's error cloning. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };

export interface IpcError {
  code: IpcErrorCode;
  message: string;
}

export type IpcErrorCode =
  | 'INVALID_REQUEST'
  | 'UNTRUSTED_SENDER'
  | 'BROWSER_NOT_RUNNING'
  | 'BROWSER_LAUNCH_FAILED'
  | 'TASK_REJECTED'
  | 'SHUTTING_DOWN'
  | 'INTERNAL_ERROR';

export interface ActivePageInfo {
  title: string;
  url: string;
}

export interface ExtensionStatusDto {
  state: ExtensionState;
  extensionVersion?: string;
  connectedAt?: string;
  activePage?: ActivePageInfo;
}

export interface CurrentTaskDto {
  id: string;
  command: string;
  status: TaskStatus;
}

export interface AgentStatusSnapshot {
  agent: AgentState;
  browser: BrowserState;
  /** Human-readable reason when the browser is in ERROR or DISCONNECTED. */
  browserMessage?: string;
  extension: ExtensionStatusDto;
  currentTask?: CurrentTaskDto;
}

export interface TaskRunResultDto {
  taskId: string;
  status: TaskStatus;
  errorMessage?: string;
  finalUrl?: string;
  finalTitle?: string;
}

export type LogLevelDto = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntryDto {
  /** Monotonic sequence number, used by the UI to de-duplicate backlog and live entries. */
  seq: number;
  timestamp: string;
  level: LogLevelDto;
  component: string;
  message: string;
  taskId?: string;
}

export type Unsubscribe = () => void;

/** The API exposed to the renderer as `window.atlas` by the preload script. */
export interface AtlasApi {
  agent: {
    getStatus(): Promise<IpcResult<AgentStatusSnapshot>>;
    onStatusChanged(listener: (snapshot: AgentStatusSnapshot) => void): Unsubscribe;
  };
  browser: {
    launch(): Promise<IpcResult<null>>;
    stop(): Promise<IpcResult<null>>;
  };
  tasks: {
    run(command: string): Promise<IpcResult<TaskRunResultDto>>;
  };
  extension: {
    getStatus(): Promise<IpcResult<ExtensionStatusDto>>;
  };
  logs: {
    /** Starts live log delivery and returns the recent backlog. */
    subscribe(): Promise<IpcResult<LogEntryDto[]>>;
    onEntry(listener: (entry: LogEntryDto) => void): Unsubscribe;
  };
}
