import {
  SEARCH_JOB_STATUSES,
  type JobSelection,
  type JobStatusChange,
  type NewSearchJob,
  type RunningJobUpdate,
  type SearchJob,
  type SearchJobStore,
  type SearchJobView,
} from '@atlas/search-planner';

import type { SqlParams, SqlRow } from '../../sqlite/sqlite-database.js';
import { clampLimit, timestamp, type RepositoryContext } from '../repository-context.js';
import { readEnum, readInteger, readNullableString, readString } from '../row-readers.js';
import { flag, inList } from './sql-helpers.js';

export type SearchJobRepository = SearchJobStore;

/** Used when a guard on attempt_count is not requested. */
const NO_ATTEMPT_LIMIT = 2_147_483_647;

/** Queue order. rowid breaks ties between jobs created in the same millisecond. */
const QUEUE_ORDER = 'priority DESC, created_at ASC, rowid ASC';

export class SqliteSearchJobRepository implements SearchJobRepository {
  constructor(private readonly context: RepositoryContext) {}

  insertJobs(jobs: readonly NewSearchJob[]): number {
    const now = timestamp(this.context);
    let inserted = 0;
    for (const job of jobs) {
      // UNIQUE (campaign_id, source_id, query_id) prevents duplicate jobs.
      inserted += this.context.db.run(
        `INSERT INTO search_jobs
           (id, campaign_id, query_id, source_id, country_code, institution_id, status, priority,
            created_at, updated_at)
         VALUES
           (:id, :campaignId, :queryId, :sourceId, :countryCode, :institutionId, 'PENDING', :priority,
            :now, :now)
         ON CONFLICT DO NOTHING`,
        {
          id: job.id,
          campaignId: job.campaignId,
          queryId: job.queryId,
          sourceId: job.sourceId,
          countryCode: job.countryCode,
          institutionId: job.institutionId,
          priority: job.priority,
          now,
        },
      ).changes;
    }
    return inserted;
  }

  findJob(id: string): SearchJob | undefined {
    const row = this.context.db.get('SELECT * FROM search_jobs WHERE id = :id', { id });
    return row ? toJob(row) : undefined;
  }

  peekNextPendingJob(selection: JobSelection): SearchJob | undefined {
    const { where, params } = pendingFilter(selection);
    const row = this.context.db.get(
      `SELECT * FROM search_jobs WHERE ${where} ORDER BY ${QUEUE_ORDER} LIMIT 1`,
      params,
    );
    return row ? toJob(row) : undefined;
  }

  claimNextPendingJob(selection: JobSelection): SearchJob | undefined {
    const { where, params } = pendingFilter(selection);
    // A single statement: selecting and claiming cannot be interleaved by another writer.
    const row = this.context.db.get(
      `UPDATE search_jobs SET
         status = 'RUNNING',
         attempt_count = attempt_count + 1,
         started_at = :now,
         completed_at = NULL,
         updated_at = :now
       WHERE id = (SELECT id FROM search_jobs WHERE ${where} ORDER BY ${QUEUE_ORDER} LIMIT 1)
         AND status = 'PENDING'
       RETURNING *`,
      { ...params, now: timestamp(this.context) },
    );
    return row ? toJob(row) : undefined;
  }

  transitionJob(id: string, change: JobStatusChange): SearchJob | undefined {
    const from = inList('from', change.from, SEARCH_JOB_STATUSES);
    const row = this.context.db.get(
      `UPDATE search_jobs SET
         status = :to,
         updated_at = :now,
         started_at = CASE WHEN :markStarted = 1 THEN :now ELSE started_at END,
         completed_at = CASE
           WHEN :markCompleted = 1 THEN :now
           WHEN :clearCompleted = 1 THEN NULL
           ELSE completed_at END,
         last_error = CASE WHEN :setError = 1 THEN :lastError ELSE last_error END,
         attempt_count = attempt_count + :attemptDelta
       WHERE id = :id AND status IN (${from.sql}) AND attempt_count < :attemptsBelow
       RETURNING *`,
      {
        ...from.params,
        id,
        to: change.to,
        now: timestamp(this.context),
        markStarted: flag(change.markStarted),
        markCompleted: flag(change.markCompleted),
        clearCompleted: flag(change.clearCompleted),
        setError: flag(change.lastError !== undefined),
        lastError: change.lastError ?? null,
        attemptDelta: change.incrementAttempt ? 1 : 0,
        attemptsBelow: change.requireAttemptsBelow ?? NO_ATTEMPT_LIMIT,
      },
    );
    return row ? toJob(row) : undefined;
  }

  updateRunningJob(id: string, update: RunningJobUpdate): SearchJob | undefined {
    const hasPage = update.currentPage !== undefined;
    const row = this.context.db.get(
      `UPDATE search_jobs SET
         current_page = CASE WHEN :hasPage = 1 THEN :page ELSE current_page END,
         discovered_count = discovered_count + :discoveredDelta,
         attempt_count = attempt_count + :attemptDelta,
         updated_at = :now
       WHERE id = :id
         AND status = 'RUNNING'
         AND (:hasPage = 0 OR :page >= current_page)
         AND attempt_count < :attemptsBelow
       RETURNING *`,
      {
        id,
        hasPage: flag(hasPage),
        page: update.currentPage ?? 0,
        discoveredDelta: update.discoveredDelta ?? 0,
        attemptDelta: update.incrementAttempt ? 1 : 0,
        attemptsBelow: update.requireAttemptsBelow ?? NO_ATTEMPT_LIMIT,
        now: timestamp(this.context),
      },
    );
    return row ? toJob(row) : undefined;
  }

  transitionCampaignJobs(
    campaignId: string,
    from: readonly SearchJob['status'][],
    to: SearchJob['status'],
  ): number {
    const statuses = inList('from', from, SEARCH_JOB_STATUSES);
    return this.context.db.run(
      `UPDATE search_jobs SET status = :to, updated_at = :now
       WHERE campaign_id = :campaignId AND status IN (${statuses.sql})`,
      { ...statuses.params, campaignId, to, now: timestamp(this.context) },
    ).changes;
  }

  recoverInterruptedJobs(
    maxAttempts: number,
    message: string,
  ): { requeued: number; failed: number } {
    const now = timestamp(this.context);
    const failed = this.context.db.run(
      `UPDATE search_jobs SET status = 'FAILED', last_error = :message, completed_at = :now, updated_at = :now
       WHERE status = 'RUNNING' AND attempt_count >= :maxAttempts`,
      { maxAttempts, message, now },
    ).changes;
    const requeued = this.context.db.run(
      `UPDATE search_jobs SET status = 'PENDING', updated_at = :now WHERE status = 'RUNNING'`,
      { now },
    ).changes;
    return { requeued, failed };
  }

  countJobs(campaignId: string): number {
    const row = this.context.db.get(
      'SELECT COUNT(*) AS count FROM search_jobs WHERE campaign_id = :campaignId',
      { campaignId },
    );
    return Number(row?.count ?? 0);
  }

  listJobViews(campaignId: string, page: { limit: number; offset: number }): SearchJobView[] {
    return this.context.db
      .all(
        `SELECT j.*, q.query_text, q.education_level, s.name AS source_name, i.name AS institution_name
         FROM search_jobs j
         JOIN search_queries q ON q.id = j.query_id
         JOIN search_sources s ON s.id = j.source_id
         LEFT JOIN institutions i ON i.id = j.institution_id
         WHERE j.campaign_id = :campaignId
         ORDER BY j.priority DESC, j.created_at ASC, j.rowid ASC
         LIMIT :limit OFFSET :offset`,
        { campaignId, limit: clampLimit(page.limit), offset: Math.max(0, Math.trunc(page.offset)) },
      )
      .map((row) => ({
        ...toJob(row),
        queryText: readString(row, 'query_text'),
        educationLevel: readNullableString(row, 'education_level'),
        sourceName: readString(row, 'source_name'),
        institutionName: readNullableString(row, 'institution_name'),
      }));
  }
}

function pendingFilter(selection: JobSelection): { where: string; params: SqlParams } {
  const clauses = ["status = 'PENDING'", 'attempt_count < :maxAttempts'];
  const params: SqlParams = { maxAttempts: selection.maxAttempts };
  if (selection.campaignId !== undefined) {
    clauses.push('campaign_id = :campaignId');
    params.campaignId = selection.campaignId;
  }
  if (selection.sourceId !== undefined) {
    clauses.push('source_id = :sourceId');
    params.sourceId = selection.sourceId;
  }
  return { where: clauses.join(' AND '), params };
}

function toJob(row: SqlRow): SearchJob {
  return {
    id: readString(row, 'id'),
    campaignId: readString(row, 'campaign_id'),
    queryId: readString(row, 'query_id'),
    sourceId: readString(row, 'source_id'),
    countryCode: readString(row, 'country_code'),
    institutionId: readNullableString(row, 'institution_id'),
    status: readEnum(row, 'status', SEARCH_JOB_STATUSES),
    priority: readInteger(row, 'priority'),
    attemptCount: readInteger(row, 'attempt_count'),
    currentPage: readInteger(row, 'current_page'),
    discoveredCount: readInteger(row, 'discovered_count'),
    createdAt: readString(row, 'created_at'),
    updatedAt: readString(row, 'updated_at'),
    startedAt: readNullableString(row, 'started_at'),
    completedAt: readNullableString(row, 'completed_at'),
    lastError: readNullableString(row, 'last_error'),
  };
}
