/**
 * Search vocabulary the renderer needs. Kept dependency-free (the renderer
 * cannot import @atlas/search-planner, which uses Node APIs); a unit test
 * checks these lists stay identical to the domain definitions.
 */

export const SEARCH_CAMPAIGN_STATUS_VALUES = [
  'DRAFT',
  'PLANNED',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type SearchCampaignStatusDto = (typeof SEARCH_CAMPAIGN_STATUS_VALUES)[number];

export const SEARCH_JOB_STATUS_VALUES = [
  'PENDING',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'FAILED',
  'SKIPPED',
] as const;
export type SearchJobStatusDto = (typeof SEARCH_JOB_STATUS_VALUES)[number];

export const EDUCATION_LEVEL_VALUES = [
  'DIPLOMA',
  'ADVANCED_DIPLOMA',
  'ASSOCIATE',
  'BACHELOR',
  'POSTGRADUATE_DIPLOMA',
  'MASTER',
  'DOCTORATE',
  'OTHER_HIGHER_EDUCATION',
] as const;
export type EducationLevelDto = (typeof EDUCATION_LEVEL_VALUES)[number];

/** The development campaign created by "Create Test Campaign". */
export const TEST_CAMPAIGN_PRESET = {
  name: 'Transcript Search Test',
  countries: ['CA', 'US', 'GB'],
  educationLevels: ['DIPLOMA', 'BACHELOR', 'MASTER'],
  sourceIds: ['scribd'],
} as const;
