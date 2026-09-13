import { canTransition, sourcesOf, type TransitionTable } from './transitions.js';

export const SEARCH_JOB_STATUSES = [
  'PENDING',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'FAILED',
  'SKIPPED',
] as const;

export type SearchJobStatus = (typeof SEARCH_JOB_STATUSES)[number];

/**
 * RUNNING -> PENDING only happens when a worker was interrupted (e.g. app crash).
 * FAILED -> PENDING only happens on an explicit retry, within the attempt limit.
 */
export const SEARCH_JOB_TRANSITIONS: TransitionTable<SearchJobStatus> = {
  PENDING: ['RUNNING', 'PAUSED', 'SKIPPED'],
  RUNNING: ['COMPLETED', 'FAILED', 'PAUSED', 'PENDING'],
  PAUSED: ['PENDING', 'SKIPPED'],
  FAILED: ['PENDING', 'SKIPPED'],
  COMPLETED: [],
  SKIPPED: [],
};

export function canTransitionJob(from: SearchJobStatus, to: SearchJobStatus): boolean {
  return canTransition(SEARCH_JOB_TRANSITIONS, from, to);
}

export function jobStatusesThatCanBecome(to: SearchJobStatus): SearchJobStatus[] {
  return sourcesOf(SEARCH_JOB_TRANSITIONS, to);
}

/** One query executed against one source. Long-running and resumable page by page. */
export interface SearchJob {
  id: string;
  campaignId: string;
  queryId: string;
  sourceId: string;
  countryCode: string;
  institutionId: string | null;
  status: SearchJobStatus;
  priority: number;
  attemptCount: number;
  currentPage: number;
  discoveredCount: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
}

/** A job joined with the details needed to display it. */
export interface SearchJobView extends SearchJob {
  queryText: string;
  educationLevel: string | null;
  sourceName: string;
  institutionName: string | null;
}
