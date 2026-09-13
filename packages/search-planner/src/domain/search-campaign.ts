import type { EducationLevel } from './education-level.js';
import type { SearchIntent } from './search-intent.js';
import { canTransition, type TransitionTable } from './transitions.js';

export const SEARCH_CAMPAIGN_STATUSES = [
  'DRAFT',
  'PLANNED',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;

export type SearchCampaignStatus = (typeof SEARCH_CAMPAIGN_STATUSES)[number];

/**
 * DRAFT: created, not planned. PLANNED: search jobs exist (re-planning keeps it PLANNED).
 * RUNNING/PAUSED/COMPLETED: reserved for execution in later phases.
 * FAILED: planning or execution failed; it can be planned again.
 */
export const SEARCH_CAMPAIGN_TRANSITIONS: TransitionTable<SearchCampaignStatus> = {
  DRAFT: ['PLANNED', 'FAILED', 'CANCELLED'],
  PLANNED: ['PLANNED', 'RUNNING', 'CANCELLED'],
  RUNNING: ['PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'],
  PAUSED: ['RUNNING', 'CANCELLED'],
  FAILED: ['PLANNED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionCampaign(
  from: SearchCampaignStatus,
  to: SearchCampaignStatus,
): boolean {
  return canTransition(SEARCH_CAMPAIGN_TRANSITIONS, from, to);
}

/** Summary of the most recent planning run, stored with the campaign. */
export interface SearchPlanSummary {
  plannedAt: string;
  countryCount: number;
  institutionCount: number;
  queryCount: number;
  jobCount: number;
  duplicatesRemoved: number;
  newQueryCount: number;
  newJobCount: number;
  discardedByLimit: number;
  jobsByCountry: Record<string, number>;
}

/** One collection objective, e.g. "Diploma-level and higher transcripts for Canada and USA". */
export interface SearchCampaign {
  id: string;
  name: string;
  status: SearchCampaignStatus;
  countries: string[];
  educationLevels: EducationLevel[];
  transcriptKeywords: string[];
  intent: SearchIntent;
  sourceIds: string[];
  createdAt: string;
  updatedAt: string;
  plannedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  planSummary: SearchPlanSummary | null;
}
