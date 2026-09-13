import { initialSchema } from './0001-initial-schema.js';
import { searchCampaignsSchema } from './0002-search-campaigns.js';
import { searchQueriesAndJobsSchema } from './0003-search-queries-and-jobs.js';
import type { Migration } from './migration.js';

/** Every schema change, in order. Append new migrations; never edit released ones. */
export const MIGRATIONS: readonly Migration[] = [
  initialSchema,
  searchCampaignsSchema,
  searchQueriesAndJobsSchema,
];

export type { Migration } from './migration.js';
