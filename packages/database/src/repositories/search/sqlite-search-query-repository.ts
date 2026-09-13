import {
  EDUCATION_LEVELS,
  SEARCH_STRATEGY_IDS,
  type SearchQuery,
  type SearchQueryStore,
} from '@atlas/search-planner';

import type { SqlRow } from '../../sqlite/sqlite-database.js';
import { clampLimit, timestamp, type RepositoryContext } from '../repository-context.js';
import { readEnum, readInteger, readNullableString, readString } from '../row-readers.js';

export interface SearchQueryRepository extends SearchQueryStore {
  listQueries(campaignId: string, page?: { limit: number; offset: number }): SearchQuery[];
}

export class SqliteSearchQueryRepository implements SearchQueryRepository {
  constructor(private readonly context: RepositoryContext) {}

  insertQueries(queries: readonly SearchQuery[]): number {
    const createdAt = timestamp(this.context);
    let inserted = 0;
    for (const query of queries) {
      // The UNIQUE (campaign_id, query_hash) constraint is what prevents duplicates.
      inserted += this.context.db.run(
        `INSERT INTO search_queries
           (id, campaign_id, country_code, institution_id, education_level, transcript_keyword_id,
            program, strategy_id, query_text, normalized_query, query_hash, priority, created_at)
         VALUES
           (:id, :campaignId, :countryCode, :institutionId, :educationLevel, :transcriptKeywordId,
            :program, :strategyId, :queryText, :normalizedQuery, :queryHash, :priority, :createdAt)
         ON CONFLICT DO NOTHING`,
        {
          id: query.id,
          campaignId: query.campaignId,
          countryCode: query.countryCode,
          institutionId: query.institutionId,
          educationLevel: query.educationLevel,
          transcriptKeywordId: query.transcriptKeywordId,
          program: query.program,
          strategyId: query.strategyId,
          queryText: query.queryText,
          normalizedQuery: query.normalizedQuery,
          queryHash: query.queryHash,
          priority: query.priority,
          createdAt,
        },
      ).changes;
    }
    return inserted;
  }

  countQueries(campaignId: string): number {
    const row = this.context.db.get(
      'SELECT COUNT(*) AS count FROM search_queries WHERE campaign_id = :campaignId',
      { campaignId },
    );
    return Number(row?.count ?? 0);
  }

  listQueries(campaignId: string, page = { limit: 1_000, offset: 0 }): SearchQuery[] {
    return this.context.db
      .all(
        `SELECT * FROM search_queries WHERE campaign_id = :campaignId
         ORDER BY priority DESC, created_at, rowid LIMIT :limit OFFSET :offset`,
        { campaignId, limit: clampLimit(page.limit), offset: Math.max(0, Math.trunc(page.offset)) },
      )
      .map(toQuery);
  }
}

function toQuery(row: SqlRow): SearchQuery {
  const educationLevel = readNullableString(row, 'education_level');
  return {
    id: readString(row, 'id'),
    campaignId: readString(row, 'campaign_id'),
    countryCode: readString(row, 'country_code'),
    institutionId: readNullableString(row, 'institution_id'),
    educationLevel:
      educationLevel === null ? null : readEnum(row, 'education_level', EDUCATION_LEVELS),
    transcriptKeywordId: readString(row, 'transcript_keyword_id'),
    program: readNullableString(row, 'program'),
    strategyId: readEnum(row, 'strategy_id', SEARCH_STRATEGY_IDS),
    queryText: readString(row, 'query_text'),
    normalizedQuery: readString(row, 'normalized_query'),
    queryHash: readString(row, 'query_hash'),
    priority: readInteger(row, 'priority'),
  };
}
