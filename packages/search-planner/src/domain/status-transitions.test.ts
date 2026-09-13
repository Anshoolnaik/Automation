import { describe, expect, it } from 'vitest';

import {
  SEARCH_CAMPAIGN_STATUSES,
  SEARCH_CAMPAIGN_TRANSITIONS,
  canTransitionCampaign,
} from './search-campaign.js';
import {
  SEARCH_JOB_STATUSES,
  SEARCH_JOB_TRANSITIONS,
  canTransitionJob,
  jobStatusesThatCanBecome,
} from './search-job.js';
import { isTerminalStatus } from './transitions.js';

describe('SearchCampaign status transitions', () => {
  it('covers every status', () => {
    expect(Object.keys(SEARCH_CAMPAIGN_TRANSITIONS).sort()).toEqual(
      [...SEARCH_CAMPAIGN_STATUSES].sort(),
    );
  });

  it('allows planning a draft, re-planning, and planning again after failure', () => {
    expect(canTransitionCampaign('DRAFT', 'PLANNED')).toBe(true);
    expect(canTransitionCampaign('PLANNED', 'PLANNED')).toBe(true);
    expect(canTransitionCampaign('FAILED', 'PLANNED')).toBe(true);
    expect(canTransitionCampaign('DRAFT', 'FAILED')).toBe(true);
  });

  it('supports the future execution lifecycle', () => {
    expect(canTransitionCampaign('PLANNED', 'RUNNING')).toBe(true);
    expect(canTransitionCampaign('RUNNING', 'PAUSED')).toBe(true);
    expect(canTransitionCampaign('PAUSED', 'RUNNING')).toBe(true);
    expect(canTransitionCampaign('RUNNING', 'COMPLETED')).toBe(true);
  });

  it.each([
    ['DRAFT', 'RUNNING'],
    ['RUNNING', 'PLANNED'],
    ['PAUSED', 'PLANNED'],
    ['COMPLETED', 'PLANNED'],
    ['CANCELLED', 'DRAFT'],
  ] as const)('forbids %s -> %s', (from, to) => {
    expect(canTransitionCampaign(from, to)).toBe(false);
  });

  it('treats COMPLETED and CANCELLED as terminal', () => {
    const terminal = SEARCH_CAMPAIGN_STATUSES.filter((status) =>
      isTerminalStatus(SEARCH_CAMPAIGN_TRANSITIONS, status),
    );
    expect(terminal).toEqual(['COMPLETED', 'CANCELLED']);
  });
});

describe('SearchJob status transitions', () => {
  it('covers every status', () => {
    expect(Object.keys(SEARCH_JOB_TRANSITIONS).sort()).toEqual([...SEARCH_JOB_STATUSES].sort());
  });

  it('follows PENDING -> RUNNING -> COMPLETED', () => {
    expect(canTransitionJob('PENDING', 'RUNNING')).toBe(true);
    expect(canTransitionJob('RUNNING', 'COMPLETED')).toBe(true);
  });

  it('supports retry: PENDING -> RUNNING -> FAILED -> PENDING', () => {
    expect(canTransitionJob('RUNNING', 'FAILED')).toBe(true);
    expect(canTransitionJob('FAILED', 'PENDING')).toBe(true);
  });

  it('supports pause/resume and skipping', () => {
    expect(canTransitionJob('PENDING', 'PAUSED')).toBe(true);
    expect(canTransitionJob('RUNNING', 'PAUSED')).toBe(true);
    expect(canTransitionJob('PAUSED', 'PENDING')).toBe(true);
    expect(canTransitionJob('PAUSED', 'SKIPPED')).toBe(true);
  });

  it.each([
    ['PENDING', 'COMPLETED'],
    ['PENDING', 'FAILED'],
    ['COMPLETED', 'PENDING'],
    ['SKIPPED', 'PENDING'],
    ['FAILED', 'RUNNING'],
    ['PAUSED', 'RUNNING'],
  ] as const)('forbids %s -> %s', (from, to) => {
    expect(canTransitionJob(from, to)).toBe(false);
  });

  it('derives the guard set used by atomic database updates', () => {
    expect(jobStatusesThatCanBecome('PENDING').sort()).toEqual(['FAILED', 'PAUSED', 'RUNNING']);
    expect(jobStatusesThatCanBecome('RUNNING')).toEqual(['PENDING']);
  });
});
