import type { Institution } from '../domain/institution.js';
import type { SearchCampaign } from '../domain/search-campaign.js';
import type { SearchJob, SearchJobStatus, SearchJobView } from '../domain/search-job.js';
import type { SearchQuery } from '../domain/search-query.js';
import type { SearchSource } from '../domain/search-source.js';
import type {
  CampaignStatusChange,
  JobSelection,
  JobStatusChange,
  NewSearchCampaign,
  NewSearchJob,
  RunningJobUpdate,
  SearchStores,
  StatusCountRow,
} from '../ports/search-stores.js';

interface State {
  sources: Map<string, SearchSource>;
  campaigns: Map<string, SearchCampaign>;
  institutions: Map<string, Institution>;
  queries: Map<string, SearchQuery>;
  jobs: Map<string, SearchJob & { sequence: number }>;
  sequence: number;
}

/**
 * Test double for the search persistence ports. It mirrors the database's
 * uniqueness rules, status guards and transactional rollback, without SQLite.
 */
export class InMemorySearchStores implements SearchStores {
  private state: State = {
    sources: new Map([
      [
        'scribd',
        { id: 'scribd', name: 'Scribd', baseUrl: 'https://www.scribd.com', enabled: true },
      ],
    ]),
    campaigns: new Map(),
    institutions: new Map(),
    queries: new Map(),
    jobs: new Map(),
    sequence: 0,
  };
  private nextId = 0;
  /** Set to make the next job insert fail (rollback tests). */
  failNextJobInsert: Error | undefined;

  constructor(private readonly now: () => Date = () => new Date('2026-09-13T12:00:00.000Z')) {}

  private get timestamp(): string {
    return this.now().toISOString();
  }

  readonly unitOfWork = {
    transaction: <T>(work: () => T): T => {
      const snapshot = structuredClone(this.state);
      try {
        return work();
      } catch (error) {
        this.state = snapshot;
        throw error;
      }
    },
  };

  readonly sources = {
    listSources: (): SearchSource[] => [...this.state.sources.values()].map((s) => ({ ...s })),
    findSource: (id: string): SearchSource | undefined => {
      const source = this.state.sources.get(id);
      return source ? { ...source } : undefined;
    },
  };

  addSource(source: SearchSource): void {
    this.state.sources.set(source.id, { ...source });
  }

  readonly campaigns = {
    createCampaign: (input: NewSearchCampaign): SearchCampaign => {
      const campaign: SearchCampaign = {
        id: `campaign-${++this.nextId}`,
        name: input.name,
        status: 'DRAFT',
        countries: [...input.intent.countries],
        educationLevels: [...input.intent.educationLevels],
        transcriptKeywords: [...input.intent.keywords],
        intent: structuredClone(input.intent),
        sourceIds: [...input.sourceIds],
        createdAt: this.timestamp,
        updatedAt: this.timestamp,
        plannedAt: null,
        startedAt: null,
        completedAt: null,
        lastError: null,
        planSummary: null,
      };
      this.state.campaigns.set(campaign.id, campaign);
      return structuredClone(campaign);
    },
    findCampaign: (id: string): SearchCampaign | undefined => {
      const campaign = this.state.campaigns.get(id);
      return campaign ? structuredClone(campaign) : undefined;
    },
    listCampaigns: (limit: number): SearchCampaign[] =>
      [...this.state.campaigns.values()]
        .reverse()
        .slice(0, limit)
        .map((c) => structuredClone(c)),
    transitionCampaign: (id: string, change: CampaignStatusChange): SearchCampaign | undefined => {
      const campaign = this.state.campaigns.get(id);
      if (!campaign || !change.from.includes(campaign.status)) return undefined;
      campaign.status = change.to;
      campaign.updatedAt = this.timestamp;
      if (change.markPlanned) campaign.plannedAt = this.timestamp;
      if (change.markStarted) campaign.startedAt = this.timestamp;
      if (change.markCompleted) campaign.completedAt = this.timestamp;
      if (change.planSummary) campaign.planSummary = structuredClone(change.planSummary);
      if (change.intent) {
        campaign.intent = structuredClone(change.intent);
        campaign.countries = [...change.intent.countries];
        campaign.educationLevels = [...change.intent.educationLevels];
        campaign.transcriptKeywords = [...change.intent.keywords];
      }
      if (change.sourceIds) campaign.sourceIds = [...change.sourceIds];
      if (change.lastError !== undefined) campaign.lastError = change.lastError;
      return structuredClone(campaign);
    },
    recordCampaignError: (id: string, message: string): void => {
      const campaign = this.state.campaigns.get(id);
      if (campaign) campaign.lastError = message;
    },
  };

  readonly institutions = {
    upsertInstitutions: (institutions: readonly Institution[]): void => {
      for (const institution of institutions) {
        this.state.institutions.set(institution.id, structuredClone(institution));
      }
    },
  };

  countInstitutions(): number {
    return this.state.institutions.size;
  }

  readonly queries = {
    insertQueries: (queries: readonly SearchQuery[]): number => {
      let inserted = 0;
      for (const query of queries) {
        const duplicate = [...this.state.queries.values()].some(
          (existing) =>
            existing.id === query.id ||
            (existing.campaignId === query.campaignId && existing.queryHash === query.queryHash),
        );
        if (duplicate) continue;
        this.state.queries.set(query.id, structuredClone(query));
        inserted += 1;
      }
      return inserted;
    },
    countQueries: (campaignId: string): number =>
      [...this.state.queries.values()].filter((q) => q.campaignId === campaignId).length,
  };

  listQueries(campaignId: string): SearchQuery[] {
    return [...this.state.queries.values()].filter((q) => q.campaignId === campaignId);
  }

  readonly jobs = {
    insertJobs: (jobs: readonly NewSearchJob[]): number => {
      if (this.failNextJobInsert) {
        const error = this.failNextJobInsert;
        this.failNextJobInsert = undefined;
        throw error;
      }
      let inserted = 0;
      for (const job of jobs) {
        const duplicate = [...this.state.jobs.values()].some(
          (existing) =>
            existing.id === job.id ||
            (existing.campaignId === job.campaignId &&
              existing.sourceId === job.sourceId &&
              existing.queryId === job.queryId),
        );
        if (duplicate) continue;
        this.state.jobs.set(job.id, {
          ...job,
          status: 'PENDING',
          attemptCount: 0,
          currentPage: 0,
          discoveredCount: 0,
          createdAt: this.timestamp,
          updatedAt: this.timestamp,
          startedAt: null,
          completedAt: null,
          lastError: null,
          sequence: ++this.state.sequence,
        });
        inserted += 1;
      }
      return inserted;
    },
    findJob: (id: string): SearchJob | undefined => this.publicJob(this.state.jobs.get(id)),
    peekNextPendingJob: (selection: JobSelection): SearchJob | undefined =>
      this.publicJob(this.nextPending(selection)),
    claimNextPendingJob: (selection: JobSelection): SearchJob | undefined => {
      const job = this.nextPending(selection);
      if (!job) return undefined;
      Object.assign(job, {
        status: 'RUNNING',
        attemptCount: job.attemptCount + 1,
        startedAt: this.timestamp,
        completedAt: null,
        updatedAt: this.timestamp,
      });
      return this.publicJob(job);
    },
    transitionJob: (id: string, change: JobStatusChange): SearchJob | undefined => {
      const job = this.state.jobs.get(id);
      if (!job || !change.from.includes(job.status)) return undefined;
      if (
        change.requireAttemptsBelow !== undefined &&
        job.attemptCount >= change.requireAttemptsBelow
      ) {
        return undefined;
      }
      job.status = change.to;
      job.updatedAt = this.timestamp;
      if (change.markStarted) job.startedAt = this.timestamp;
      if (change.markCompleted) job.completedAt = this.timestamp;
      else if (change.clearCompleted) job.completedAt = null;
      if (change.lastError !== undefined) job.lastError = change.lastError;
      if (change.incrementAttempt) job.attemptCount += 1;
      return this.publicJob(job);
    },
    updateRunningJob: (id: string, update: RunningJobUpdate): SearchJob | undefined => {
      const job = this.state.jobs.get(id);
      if (!job || job.status !== 'RUNNING') return undefined;
      if (update.currentPage !== undefined && update.currentPage < job.currentPage)
        return undefined;
      if (
        update.requireAttemptsBelow !== undefined &&
        job.attemptCount >= update.requireAttemptsBelow
      ) {
        return undefined;
      }
      if (update.currentPage !== undefined) job.currentPage = update.currentPage;
      job.discoveredCount += update.discoveredDelta ?? 0;
      if (update.incrementAttempt) job.attemptCount += 1;
      job.updatedAt = this.timestamp;
      return this.publicJob(job);
    },
    transitionCampaignJobs: (
      campaignId: string,
      from: readonly SearchJobStatus[],
      to: SearchJobStatus,
    ): number => {
      let changed = 0;
      for (const job of this.state.jobs.values()) {
        if (job.campaignId === campaignId && from.includes(job.status)) {
          job.status = to;
          changed += 1;
        }
      }
      return changed;
    },
    recoverInterruptedJobs: (maxAttempts: number, message: string) => {
      let requeued = 0;
      let failed = 0;
      for (const job of this.state.jobs.values()) {
        if (job.status !== 'RUNNING') continue;
        if (job.attemptCount >= maxAttempts) {
          Object.assign(job, { status: 'FAILED', lastError: message, completedAt: this.timestamp });
          failed += 1;
        } else {
          job.status = 'PENDING';
          requeued += 1;
        }
      }
      return { requeued, failed };
    },
    countJobs: (campaignId: string): number =>
      [...this.state.jobs.values()].filter((j) => j.campaignId === campaignId).length,
    listJobViews: (campaignId: string, page: { limit: number; offset: number }): SearchJobView[] =>
      this.orderedJobs()
        .filter((job) => job.campaignId === campaignId)
        .slice(page.offset, page.offset + page.limit)
        .map((job) => {
          const query = this.state.queries.get(job.queryId);
          return {
            ...this.publicJob(job)!,
            queryText: query?.queryText ?? '',
            educationLevel: query?.educationLevel ?? null,
            sourceName: this.state.sources.get(job.sourceId)?.name ?? job.sourceId,
            institutionName: job.institutionId
              ? (this.state.institutions.get(job.institutionId)?.name ?? null)
              : null,
          };
        }),
  };

  readonly progress = {
    countJobsByStatus: (campaignId: string): StatusCountRow[] =>
      this.group(campaignId, () => ({})).map(({ status, count }) => ({ status, count })),
    countJobsByCountry: (campaignId: string) =>
      this.group(campaignId, (job) => ({ countryCode: job.countryCode })),
    countJobsBySource: (campaignId: string) =>
      this.group(campaignId, (job) => ({
        sourceId: job.sourceId,
        sourceName: this.state.sources.get(job.sourceId)?.name ?? job.sourceId,
      })),
    countJobsByInstitution: (campaignId: string) =>
      this.group(
        campaignId,
        (job) => ({
          institutionId: job.institutionId ?? '',
          institutionName: this.state.institutions.get(job.institutionId ?? '')?.name ?? '',
        }),
        (job) => job.institutionId !== null,
      ),
  };

  private group<K extends Record<string, string>>(
    campaignId: string,
    keyOf: (job: SearchJob) => K,
    include: (job: SearchJob) => boolean = () => true,
  ): Array<K & StatusCountRow> {
    const groups = new Map<string, K & StatusCountRow>();
    for (const job of this.state.jobs.values()) {
      if (job.campaignId !== campaignId || !include(job)) continue;
      const key = keyOf(job);
      const id = JSON.stringify([key, job.status]);
      const existing = groups.get(id);
      if (existing) existing.count += 1;
      else groups.set(id, { ...key, status: job.status, count: 1 });
    }
    return [...groups.values()];
  }

  private orderedJobs(): Array<SearchJob & { sequence: number }> {
    return [...this.state.jobs.values()].sort(
      (a, b) =>
        b.priority - a.priority ||
        (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) ||
        a.sequence - b.sequence,
    );
  }

  private nextPending(selection: JobSelection): (SearchJob & { sequence: number }) | undefined {
    return this.orderedJobs().find(
      (job) =>
        job.status === 'PENDING' &&
        job.attemptCount < selection.maxAttempts &&
        (selection.campaignId === undefined || job.campaignId === selection.campaignId) &&
        (selection.sourceId === undefined || job.sourceId === selection.sourceId),
    );
  }

  private publicJob(job: (SearchJob & { sequence: number }) | undefined): SearchJob | undefined {
    if (!job) return undefined;
    const { sequence: _sequence, ...rest } = job;
    return { ...rest };
  }
}
