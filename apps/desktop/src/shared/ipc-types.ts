import type { AgentState, BrowserState, ExtensionState, TaskStatus } from '@atlas/agent-protocol';

import type {
  EducationLevelDto,
  SearchCampaignStatusDto,
  SearchJobStatusDto,
} from './search-vocabulary.js';

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
  | 'NOT_FOUND'
  | 'INVALID_STATE'
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

// ------------------------------------------------------------------ Search campaigns (Phase 2)

export interface NamedCodeDto {
  code: string;
  name: string;
}

export interface CreateSearchCampaignRequest {
  name: string;
  /** Country codes, e.g. "CA". */
  countries: string[];
  educationLevels: EducationLevelDto[];
  /** Transcript keyword IDs; all keywords when omitted. */
  keywords?: string[];
  includeInstitutions?: boolean;
  programNames?: string[];
  sourceIds: string[];
}

export interface SearchPlanSummaryDto {
  plannedAt: string;
  countryCount: number;
  institutionCount: number;
  queryCount: number;
  jobCount: number;
  duplicatesRemoved: number;
  newQueryCount: number;
  newJobCount: number;
  discardedByLimit: number;
  jobsByCountry: Array<NamedCodeDto & { jobs: number }>;
}

export interface SearchCampaignDto {
  id: string;
  name: string;
  status: SearchCampaignStatusDto;
  countries: NamedCodeDto[];
  educationLevels: NamedCodeDto[];
  keywordCount: number;
  includeInstitutions: boolean;
  sources: NamedCodeDto[];
  createdAt: string;
  plannedAt: string | null;
  lastError: string | null;
  planSummary: SearchPlanSummaryDto | null;
}

export interface ProgressCountsDto {
  total: number;
  completed: number;
  failed: number;
  remaining: number;
}

export interface SearchProgressDto {
  campaignId: string;
  totalJobs: number;
  pendingJobs: number;
  runningJobs: number;
  pausedJobs: number;
  completedJobs: number;
  failedJobs: number;
  skippedJobs: number;
  completedPercent: number;
  byCountry: Array<NamedCodeDto & ProgressCountsDto>;
  bySource: Array<NamedCodeDto & ProgressCountsDto>;
  byInstitution: Array<NamedCodeDto & ProgressCountsDto>;
}

export interface SearchJobDto {
  id: string;
  priority: number;
  queryText: string;
  countryCode: string;
  countryName: string;
  institutionName: string | null;
  educationLevel: string | null;
  sourceName: string;
  status: SearchJobStatusDto;
  attemptCount: number;
  currentPage: number;
  discoveredCount: number;
  createdAt: string;
}

export interface SearchJobPageRequest {
  limit?: number;
  offset?: number;
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
  search: {
    createCampaign(request: CreateSearchCampaignRequest): Promise<IpcResult<SearchCampaignDto>>;
    /** Generates (or regenerates) the plan. Never executes searches. */
    planCampaign(campaignId: string): Promise<IpcResult<SearchCampaignDto>>;
    listCampaigns(): Promise<IpcResult<SearchCampaignDto[]>>;
    getCampaign(campaignId: string): Promise<IpcResult<SearchCampaignDto>>;
    getProgress(campaignId: string): Promise<IpcResult<SearchProgressDto>>;
    listJobs(campaignId: string, page?: SearchJobPageRequest): Promise<IpcResult<SearchJobDto[]>>;
  };
  logs: {
    /** Starts live log delivery and returns the recent backlog. */
    subscribe(): Promise<IpcResult<LogEntryDto[]>>;
    onEntry(listener: (entry: LogEntryDto) => void): Unsubscribe;
  };
}
