import type { Institution } from '../domain/institution.js';
import type {
  SearchCampaign,
  SearchCampaignStatus,
  SearchPlanSummary,
} from '../domain/search-campaign.js';
import type { SearchIntent } from '../domain/search-intent.js';
import type { SearchJob, SearchJobStatus, SearchJobView } from '../domain/search-job.js';
import type { SearchQuery } from '../domain/search-query.js';
import type { SearchSource } from '../domain/search-source.js';

/**
 * Persistence ports for search planning. @atlas/database implements them with
 * SQLite; the planning, queue and progress services only see these interfaces.
 * Methods are synchronous because the underlying driver is.
 */

export interface SearchSourceStore {
  listSources(): SearchSource[];
  findSource(id: string): SearchSource | undefined;
}

export interface NewSearchCampaign {
  name: string;
  intent: SearchIntent;
  sourceIds: readonly string[];
}

export interface CampaignStatusChange {
  /** The update only applies when the campaign is currently in one of these statuses. */
  from: readonly SearchCampaignStatus[];
  to: SearchCampaignStatus;
  markPlanned?: boolean;
  markStarted?: boolean;
  markCompleted?: boolean;
  planSummary?: SearchPlanSummary;
  /** Replaces the stored intent (e.g. with the canonical intent a plan was built from). */
  intent?: SearchIntent;
  sourceIds?: readonly string[];
  /** `undefined` leaves the stored error unchanged; `null` clears it. */
  lastError?: string | null;
}

export interface SearchCampaignStore {
  createCampaign(input: NewSearchCampaign): SearchCampaign;
  findCampaign(id: string): SearchCampaign | undefined;
  listCampaigns(limit: number): SearchCampaign[];
  /** Returns the updated campaign, or `undefined` if the status guard did not match. */
  transitionCampaign(id: string, change: CampaignStatusChange): SearchCampaign | undefined;
  recordCampaignError(id: string, message: string): void;
}

export interface InstitutionStore {
  /** Inserts new institutions and refreshes existing ones (matched by ID). */
  upsertInstitutions(institutions: readonly Institution[]): void;
}

export interface SearchQueryStore {
  /** Inserts queries, ignoring ones that already exist for the campaign. Returns how many were new. */
  insertQueries(queries: readonly SearchQuery[]): number;
  countQueries(campaignId: string): number;
}

export interface NewSearchJob {
  id: string;
  campaignId: string;
  queryId: string;
  sourceId: string;
  countryCode: string;
  institutionId: string | null;
  priority: number;
}

export interface JobSelection {
  campaignId?: string;
  sourceId?: string;
  /** Jobs that already used this many attempts are not selected. */
  maxAttempts: number;
}

export interface JobStatusChange {
  from: readonly SearchJobStatus[];
  to: SearchJobStatus;
  markStarted?: boolean;
  markCompleted?: boolean;
  clearCompleted?: boolean;
  /** `undefined` leaves the stored error unchanged; `null` clears it. */
  lastError?: string | null;
  incrementAttempt?: boolean;
  /** Only apply when attempt_count is below this value. */
  requireAttemptsBelow?: number;
}

export interface RunningJobUpdate {
  /** New current page; must not be lower than the stored one. */
  currentPage?: number;
  discoveredDelta?: number;
  incrementAttempt?: boolean;
  requireAttemptsBelow?: number;
}

export interface SearchJobStore {
  /** Inserts jobs, ignoring (campaign, source, query) combinations that already exist. Returns how many were new. */
  insertJobs(jobs: readonly NewSearchJob[]): number;
  findJob(id: string): SearchJob | undefined;
  /** Highest priority, then oldest, PENDING job. Read-only. */
  peekNextPendingJob(selection: JobSelection): SearchJob | undefined;
  /** Atomically moves the next PENDING job to RUNNING and counts an attempt. */
  claimNextPendingJob(selection: JobSelection): SearchJob | undefined;
  /** Returns the updated job, or `undefined` if a guard did not match. */
  transitionJob(id: string, change: JobStatusChange): SearchJob | undefined;
  /** Updates a RUNNING job. Returns `undefined` if the job is not RUNNING or a guard did not match. */
  updateRunningJob(id: string, update: RunningJobUpdate): SearchJob | undefined;
  transitionCampaignJobs(
    campaignId: string,
    from: readonly SearchJobStatus[],
    to: SearchJobStatus,
  ): number;
  /**
   * After an unclean shutdown: RUNNING jobs return to PENDING, or become FAILED
   * when they have no attempts left.
   */
  recoverInterruptedJobs(
    maxAttempts: number,
    message: string,
  ): { requeued: number; failed: number };
  countJobs(campaignId: string): number;
  listJobViews(campaignId: string, page: { limit: number; offset: number }): SearchJobView[];
}

export interface StatusCountRow {
  status: SearchJobStatus;
  count: number;
}

/** Aggregates computed in the database, never by loading every job. */
export interface SearchProgressReader {
  countJobsByStatus(campaignId: string): StatusCountRow[];
  countJobsByCountry(campaignId: string): Array<StatusCountRow & { countryCode: string }>;
  countJobsBySource(
    campaignId: string,
  ): Array<StatusCountRow & { sourceId: string; sourceName: string }>;
  countJobsByInstitution(
    campaignId: string,
  ): Array<StatusCountRow & { institutionId: string; institutionName: string }>;
}

export interface SearchUnitOfWork {
  /** Runs `work` atomically: all writes commit together or none do. */
  transaction<T>(work: () => T): T;
}

/** Every store the search services need, as provided by a database adapter. */
export interface SearchStores {
  sources: SearchSourceStore;
  campaigns: SearchCampaignStore;
  institutions: InstitutionStore;
  queries: SearchQueryStore;
  jobs: SearchJobStore;
  progress: SearchProgressReader;
  unitOfWork: SearchUnitOfWork;
}
