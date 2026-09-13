import {
  SEARCH_JOB_STATUSES,
  type SearchProgressReader,
  type StatusCountRow,
} from '@atlas/search-planner';

import type { SqlRow } from '../../sqlite/sqlite-database.js';
import type { RepositoryContext } from '../repository-context.js';
import { readEnum, readInteger, readString } from '../row-readers.js';

export type SearchProgressRepository = SearchProgressReader;

/** Aggregate queries (GROUP BY) for campaign progress. */
export class SqliteSearchProgressRepository implements SearchProgressRepository {
  constructor(private readonly context: RepositoryContext) {}

  countJobsByStatus(campaignId: string): StatusCountRow[] {
    return this.context.db
      .all(
        `SELECT status, COUNT(*) AS count FROM search_jobs
         WHERE campaign_id = :campaignId GROUP BY status`,
        { campaignId },
      )
      .map(statusCount);
  }

  countJobsByCountry(campaignId: string): Array<StatusCountRow & { countryCode: string }> {
    return this.context.db
      .all(
        `SELECT country_code, status, COUNT(*) AS count FROM search_jobs
         WHERE campaign_id = :campaignId GROUP BY country_code, status`,
        { campaignId },
      )
      .map((row) => ({ ...statusCount(row), countryCode: readString(row, 'country_code') }));
  }

  countJobsBySource(
    campaignId: string,
  ): Array<StatusCountRow & { sourceId: string; sourceName: string }> {
    return this.context.db
      .all(
        `SELECT j.source_id, s.name AS source_name, j.status, COUNT(*) AS count
         FROM search_jobs j JOIN search_sources s ON s.id = j.source_id
         WHERE j.campaign_id = :campaignId
         GROUP BY j.source_id, s.name, j.status`,
        { campaignId },
      )
      .map((row) => ({
        ...statusCount(row),
        sourceId: readString(row, 'source_id'),
        sourceName: readString(row, 'source_name'),
      }));
  }

  countJobsByInstitution(
    campaignId: string,
  ): Array<StatusCountRow & { institutionId: string; institutionName: string }> {
    return this.context.db
      .all(
        `SELECT j.institution_id, i.name AS institution_name, j.status, COUNT(*) AS count
         FROM search_jobs j JOIN institutions i ON i.id = j.institution_id
         WHERE j.campaign_id = :campaignId
         GROUP BY j.institution_id, i.name, j.status`,
        { campaignId },
      )
      .map((row) => ({
        ...statusCount(row),
        institutionId: readString(row, 'institution_id'),
        institutionName: readString(row, 'institution_name'),
      }));
  }
}

function statusCount(row: SqlRow): StatusCountRow {
  return { status: readEnum(row, 'status', SEARCH_JOB_STATUSES), count: readInteger(row, 'count') };
}
