import {
  SEARCH_CAMPAIGN_STATUSES,
  SearchIntentShapeSchema,
  SearchPlanSummarySchema,
  type CampaignStatusChange,
  type NewSearchCampaign,
  type SearchCampaign,
  type SearchCampaignStore,
} from '@atlas/search-planner';
import { z } from 'zod';

import type { SqlRow } from '../../sqlite/sqlite-database.js';
import { clampLimit, timestamp, type RepositoryContext } from '../repository-context.js';
import {
  readEnum,
  readJson,
  readNullableJson,
  readNullableString,
  readString,
} from '../row-readers.js';
import { flag, inList } from './sql-helpers.js';

export type SearchCampaignRepository = SearchCampaignStore;

const SourceIdsSchema = z.array(z.string());

export class SqliteSearchCampaignRepository implements SearchCampaignRepository {
  constructor(private readonly context: RepositoryContext) {}

  createCampaign(input: NewSearchCampaign): SearchCampaign {
    const id = this.context.generateId();
    const now = timestamp(this.context);
    this.context.db.run(
      `INSERT INTO search_campaigns
         (id, name, status, intent_json, source_ids_json, created_at, updated_at)
       VALUES (:id, :name, 'DRAFT', :intentJson, :sourceIdsJson, :now, :now)`,
      {
        id,
        name: input.name.trim(),
        intentJson: JSON.stringify(input.intent),
        sourceIdsJson: JSON.stringify([...input.sourceIds]),
        now,
      },
    );
    return this.require(id);
  }

  findCampaign(id: string): SearchCampaign | undefined {
    const row = this.context.db.get('SELECT * FROM search_campaigns WHERE id = :id', { id });
    return row ? toCampaign(row) : undefined;
  }

  listCampaigns(limit: number): SearchCampaign[] {
    return this.context.db
      .all('SELECT * FROM search_campaigns ORDER BY created_at DESC, rowid DESC LIMIT :limit', {
        limit: clampLimit(limit),
      })
      .map(toCampaign);
  }

  transitionCampaign(id: string, change: CampaignStatusChange): SearchCampaign | undefined {
    const from = inList('from', change.from, SEARCH_CAMPAIGN_STATUSES);
    const row = this.context.db.get(
      `UPDATE search_campaigns SET
         status = :to,
         updated_at = :now,
         planned_at = CASE WHEN :markPlanned = 1 THEN :now ELSE planned_at END,
         started_at = CASE WHEN :markStarted = 1 THEN :now ELSE started_at END,
         completed_at = CASE WHEN :markCompleted = 1 THEN :now ELSE completed_at END,
         plan_summary_json = CASE WHEN :hasSummary = 1 THEN :summary ELSE plan_summary_json END,
         intent_json = CASE WHEN :hasIntent = 1 THEN :intentJson ELSE intent_json END,
         source_ids_json = CASE WHEN :hasSources = 1 THEN :sourceIdsJson ELSE source_ids_json END,
         last_error = CASE WHEN :setError = 1 THEN :lastError ELSE last_error END
       WHERE id = :id AND status IN (${from.sql})
       RETURNING *`,
      {
        ...from.params,
        id,
        to: change.to,
        now: timestamp(this.context),
        markPlanned: flag(change.markPlanned),
        markStarted: flag(change.markStarted),
        markCompleted: flag(change.markCompleted),
        hasSummary: flag(change.planSummary !== undefined),
        summary: change.planSummary ? JSON.stringify(change.planSummary) : null,
        hasIntent: flag(change.intent !== undefined),
        intentJson: change.intent ? JSON.stringify(change.intent) : null,
        hasSources: flag(change.sourceIds !== undefined),
        sourceIdsJson: change.sourceIds ? JSON.stringify([...change.sourceIds]) : null,
        setError: flag(change.lastError !== undefined),
        lastError: change.lastError ?? null,
      },
    );
    return row ? toCampaign(row) : undefined;
  }

  recordCampaignError(id: string, message: string): void {
    this.context.db.run(
      'UPDATE search_campaigns SET last_error = :message, updated_at = :now WHERE id = :id',
      { id, message, now: timestamp(this.context) },
    );
  }

  private require(id: string): SearchCampaign {
    const campaign = this.findCampaign(id);
    if (!campaign) throw new Error(`Search campaign ${id} does not exist`);
    return campaign;
  }
}

function toCampaign(row: SqlRow): SearchCampaign {
  const intent = SearchIntentShapeSchema.parse(readJson(row, 'intent_json'));
  const summary = SearchPlanSummarySchema.safeParse(readNullableJson(row, 'plan_summary_json'));
  return {
    id: readString(row, 'id'),
    name: readString(row, 'name'),
    status: readEnum(row, 'status', SEARCH_CAMPAIGN_STATUSES),
    countries: [...intent.countries],
    educationLevels: [...intent.educationLevels],
    transcriptKeywords: [...intent.keywords],
    intent,
    sourceIds: SourceIdsSchema.parse(readJson(row, 'source_ids_json')),
    createdAt: readString(row, 'created_at'),
    updatedAt: readString(row, 'updated_at'),
    plannedAt: readNullableString(row, 'planned_at'),
    startedAt: readNullableString(row, 'started_at'),
    completedAt: readNullableString(row, 'completed_at'),
    lastError: readNullableString(row, 'last_error'),
    planSummary: summary.success ? summary.data : null,
  };
}
