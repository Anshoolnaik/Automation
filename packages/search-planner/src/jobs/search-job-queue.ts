import { sanitizeErrorMessage, type Logger } from '@atlas/logger';

import { SearchError } from '../domain/errors.js';
import { canTransitionJob, type SearchJob, type SearchJobStatus } from '../domain/search-job.js';
import type { JobStatusChange, SearchJobStore } from '../ports/search-stores.js';

export const DEFAULT_MAX_ATTEMPTS = 3;

export interface SearchJobQueueOptions {
  jobs: SearchJobStore;
  logger: Logger;
  /** Maximum times a job may be started (initial run plus retries). */
  maxAttempts?: number;
}

export interface JobFilter {
  campaignId?: string;
  sourceId?: string;
}

/**
 * Work queue over persisted search jobs. It does not execute searches: future
 * website adapters (workers) claim jobs, report progress and finish them here.
 *
 * Ordering is highest priority first, then creation order. Claims are atomic in
 * the store, so several workers can share the queue without schema changes.
 * `attemptCount` counts how many times a job was started.
 */
export class SearchJobQueue {
  readonly maxAttempts: number;
  private readonly jobs: SearchJobStore;
  private readonly logger: Logger;

  constructor(options: SearchJobQueueOptions) {
    const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new RangeError('maxAttempts must be a positive integer');
    }
    this.maxAttempts = maxAttempts;
    this.jobs = options.jobs;
    this.logger = options.logger;
  }

  /** The job a worker would get next, without claiming it. */
  getNextPendingJob(filter: JobFilter = {}): SearchJob | undefined {
    return this.jobs.peekNextPendingJob({ ...filter, maxAttempts: this.maxAttempts });
  }

  /** Atomically takes the next job: PENDING -> RUNNING, counting an attempt. */
  claimNextPendingJob(filter: JobFilter = {}): SearchJob | undefined {
    const job = this.jobs.claimNextPendingJob({ ...filter, maxAttempts: this.maxAttempts });
    if (job)
      this.logger.debug('Search job claimed', {
        metadata: { jobId: job.id, attempt: job.attemptCount },
      });
    return job;
  }

  markRunning(jobId: string): SearchJob {
    return this.transition(jobId, ['PENDING'], 'RUNNING', {
      markStarted: true,
      clearCompleted: true,
      incrementAttempt: true,
      requireAttemptsBelow: this.maxAttempts,
    });
  }

  markCompleted(jobId: string): SearchJob {
    return this.transition(jobId, ['RUNNING'], 'COMPLETED', {
      markCompleted: true,
      lastError: null,
    });
  }

  markFailed(jobId: string, error: unknown): SearchJob {
    const message = sanitizeErrorMessage(error);
    const job = this.transition(jobId, ['RUNNING'], 'FAILED', {
      markCompleted: true,
      lastError: message,
    });
    this.logger.warn(`Search job failed: ${message}`, {
      metadata: { jobId, attempts: job.attemptCount, maxAttempts: this.maxAttempts },
    });
    return job;
  }

  /** FAILED -> PENDING, only while attempts remain. */
  retry(jobId: string): SearchJob {
    return this.transition(jobId, ['FAILED'], 'PENDING', {
      clearCompleted: true,
      requireAttemptsBelow: this.maxAttempts,
    });
  }

  pause(jobId: string): SearchJob {
    return this.transition(jobId, ['PENDING', 'RUNNING'], 'PAUSED', {});
  }

  resume(jobId: string): SearchJob {
    return this.transition(jobId, ['PAUSED'], 'PENDING', {});
  }

  skip(jobId: string, reason: string): SearchJob {
    return this.transition(jobId, ['PENDING', 'PAUSED', 'FAILED'], 'SKIPPED', {
      markCompleted: true,
      lastError: sanitizeErrorMessage(reason),
    });
  }

  /** Pauses every pending job of a campaign. Running jobs finish or are paused by their worker. */
  pauseCampaign(campaignId: string): number {
    return this.jobs.transitionCampaignJobs(campaignId, ['PENDING'], 'PAUSED');
  }

  resumeCampaign(campaignId: string): number {
    return this.jobs.transitionCampaignJobs(campaignId, ['PAUSED'], 'PENDING');
  }

  /** Records an additional attempt within a run (e.g. a worker retried a page in place). */
  incrementAttempt(jobId: string): SearchJob {
    return this.updateRunning(
      jobId,
      { incrementAttempt: true, requireAttemptsBelow: this.maxAttempts },
      'record another attempt for',
    );
  }

  updateCurrentPage(jobId: string, page: number): SearchJob {
    if (!Number.isInteger(page) || page < 0)
      throw new RangeError('page must be a non-negative integer');
    return this.updateRunning(jobId, { currentPage: page }, `move to page ${page} for`);
  }

  incrementDiscoveredCount(jobId: string, by = 1): SearchJob {
    if (!Number.isInteger(by) || by < 0) throw new RangeError('by must be a non-negative integer');
    return this.updateRunning(jobId, { discoveredDelta: by }, 'update the discovered count of');
  }

  /** Call at start-up: jobs left RUNNING by a crash are requeued, or failed when out of attempts. */
  recoverInterruptedJobs(): { requeued: number; failed: number } {
    const result = this.jobs.recoverInterruptedJobs(
      this.maxAttempts,
      'Interrupted before completion and no attempts remain',
    );
    if (result.requeued > 0 || result.failed > 0) {
      this.logger.warn('Recovered interrupted search jobs', { metadata: result });
    }
    return result;
  }

  private transition(
    jobId: string,
    from: readonly SearchJobStatus[],
    to: SearchJobStatus,
    change: Omit<JobStatusChange, 'from' | 'to'>,
  ): SearchJob {
    for (const status of from) {
      if (!canTransitionJob(status, to)) {
        throw new Error(`Queue misconfiguration: ${status} -> ${to} is not a valid job transition`);
      }
    }
    const updated = this.jobs.transitionJob(jobId, { ...change, from, to });
    if (updated) {
      this.logger.debug(`Search job ${to.toLowerCase()}`, { metadata: { jobId } });
      return updated;
    }
    throw this.explainRejection(jobId, from, to, change.requireAttemptsBelow);
  }

  private updateRunning(
    jobId: string,
    update: Parameters<SearchJobStore['updateRunningJob']>[1],
    action: string,
  ): SearchJob {
    const updated = this.jobs.updateRunningJob(jobId, update);
    if (updated) return updated;
    const job = this.jobs.findJob(jobId);
    if (!job) return this.notFound(jobId);
    if (job.status !== 'RUNNING') {
      throw new SearchError(
        'INVALID_JOB_STATE',
        `Cannot ${action} job ${jobId}: it is ${job.status}`,
      );
    }
    if (
      update.requireAttemptsBelow !== undefined &&
      job.attemptCount >= update.requireAttemptsBelow
    ) {
      throw new SearchError(
        'MAX_ATTEMPTS_EXCEEDED',
        `Job ${jobId} has used all ${this.maxAttempts} attempts`,
      );
    }
    throw new SearchError(
      'INVALID_JOB_STATE',
      `Cannot ${action} job ${jobId}: page ${String(update.currentPage)} is before page ${job.currentPage}`,
    );
  }

  private explainRejection(
    jobId: string,
    from: readonly SearchJobStatus[],
    to: SearchJobStatus,
    attemptsBelow: number | undefined,
  ): SearchError {
    const job = this.jobs.findJob(jobId);
    if (!job) return new SearchError('JOB_NOT_FOUND', `Search job not found: ${jobId}`);
    if (
      from.includes(job.status) &&
      attemptsBelow !== undefined &&
      job.attemptCount >= attemptsBelow
    ) {
      return new SearchError(
        'MAX_ATTEMPTS_EXCEEDED',
        `Job ${jobId} has used all ${this.maxAttempts} attempts`,
      );
    }
    return new SearchError(
      'INVALID_JOB_STATE',
      `Job ${jobId} cannot move from ${job.status} to ${to}`,
    );
  }

  private notFound(jobId: string): never {
    throw new SearchError('JOB_NOT_FOUND', `Search job not found: ${jobId}`);
  }
}
