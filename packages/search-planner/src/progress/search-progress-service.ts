import { ASSIGNMENT_COUNTRIES } from '../config/countries.js';
import type { CountryDefinition } from '../domain/country.js';
import type { SearchJobStatus } from '../domain/search-job.js';
import type { SearchProgressReader, StatusCountRow } from '../ports/search-stores.js';

export interface ProgressCounts {
  total: number;
  completed: number;
  failed: number;
  /** Pending, running or paused: work still to do. */
  remaining: number;
}

export interface CountryProgress extends ProgressCounts {
  countryCode: string;
  countryName: string;
}

export interface SourceProgress extends ProgressCounts {
  sourceId: string;
  sourceName: string;
}

export interface InstitutionProgress extends ProgressCounts {
  institutionId: string;
  institutionName: string;
}

export interface SearchProgress {
  campaignId: string;
  totalJobs: number;
  pendingJobs: number;
  runningJobs: number;
  pausedJobs: number;
  completedJobs: number;
  failedJobs: number;
  skippedJobs: number;
  /** Completed jobs as a percentage of all jobs, one decimal place. */
  completedPercent: number;
  byCountry: CountryProgress[];
  bySource: SourceProgress[];
  /** Only jobs tied to an institution; country-level queries are not included. */
  byInstitution: InstitutionProgress[];
}

const REMAINING: ReadonlySet<SearchJobStatus> = new Set(['PENDING', 'RUNNING', 'PAUSED']);

/** Campaign progress from database aggregates; never loads individual jobs. */
export class SearchProgressService {
  private readonly countryOrder: Map<string, { index: number; name: string }>;

  constructor(
    private readonly deps: {
      progress: SearchProgressReader;
      countries?: readonly CountryDefinition[];
    },
  ) {
    const countries = deps.countries ?? ASSIGNMENT_COUNTRIES;
    this.countryOrder = new Map(
      countries.map((country, index) => [country.code, { index, name: country.name }]),
    );
  }

  getProgress(campaignId: string): SearchProgress {
    const byStatus = new Map<SearchJobStatus, number>();
    for (const row of this.deps.progress.countJobsByStatus(campaignId)) {
      byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + row.count);
    }
    const count = (status: SearchJobStatus) => byStatus.get(status) ?? 0;
    const totalJobs = [...byStatus.values()].reduce((sum, value) => sum + value, 0);
    const completedJobs = count('COMPLETED');

    const byCountry = fold(
      this.deps.progress.countJobsByCountry(campaignId),
      (row) => row.countryCode,
    )
      .map(([countryCode, counts]) => ({
        countryCode,
        countryName: this.countryOrder.get(countryCode)?.name ?? countryCode,
        ...counts,
      }))
      .sort(
        (a, b) =>
          (this.countryOrder.get(a.countryCode)?.index ?? Number.MAX_SAFE_INTEGER) -
            (this.countryOrder.get(b.countryCode)?.index ?? Number.MAX_SAFE_INTEGER) ||
          compareText(a.countryCode, b.countryCode),
      );

    const sourceNames = new Map<string, string>();
    const bySource = fold(this.deps.progress.countJobsBySource(campaignId), (row) => {
      sourceNames.set(row.sourceId, row.sourceName);
      return row.sourceId;
    })
      .map(([sourceId, counts]) => ({
        sourceId,
        sourceName: sourceNames.get(sourceId) ?? sourceId,
        ...counts,
      }))
      .sort((a, b) => compareText(a.sourceName, b.sourceName));

    const institutionNames = new Map<string, string>();
    const byInstitution = fold(this.deps.progress.countJobsByInstitution(campaignId), (row) => {
      institutionNames.set(row.institutionId, row.institutionName);
      return row.institutionId;
    })
      .map(([institutionId, counts]) => ({
        institutionId,
        institutionName: institutionNames.get(institutionId) ?? institutionId,
        ...counts,
      }))
      .sort((a, b) => compareText(a.institutionName, b.institutionName));

    return {
      campaignId,
      totalJobs,
      pendingJobs: count('PENDING'),
      runningJobs: count('RUNNING'),
      pausedJobs: count('PAUSED'),
      completedJobs,
      failedJobs: count('FAILED'),
      skippedJobs: count('SKIPPED'),
      completedPercent: totalJobs === 0 ? 0 : Math.round((completedJobs / totalJobs) * 1000) / 10,
      byCountry,
      bySource,
      byInstitution,
    };
  }
}

function fold<Row extends StatusCountRow>(
  rows: readonly Row[],
  keyOf: (row: Row) => string,
): Array<[string, ProgressCounts]> {
  const groups = new Map<string, ProgressCounts>();
  for (const row of rows) {
    const key = keyOf(row);
    const counts = groups.get(key) ?? { total: 0, completed: 0, failed: 0, remaining: 0 };
    counts.total += row.count;
    if (row.status === 'COMPLETED') counts.completed += row.count;
    if (row.status === 'FAILED') counts.failed += row.count;
    if (REMAINING.has(row.status)) counts.remaining += row.count;
    groups.set(key, counts);
  }
  return [...groups.entries()];
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
