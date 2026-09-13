import { describe, expect, it } from 'vitest';

import {
  SEARCH_CAMPAIGN_STATUS_VALUES,
  SEARCH_JOB_STATUS_VALUES,
} from '../../../shared/search-vocabulary';
import {
  campaignTone,
  formatCount,
  formatDateTime,
  formatPercent,
  jobTone,
  statusLabel,
} from './search-format';

describe('search formatting', () => {
  it('labels and colours every campaign and job status', () => {
    for (const status of SEARCH_CAMPAIGN_STATUS_VALUES) expect(campaignTone(status)).toBeTruthy();
    for (const status of SEARCH_JOB_STATUS_VALUES) expect(jobTone(status)).toBeTruthy();
    expect(statusLabel('PLANNED')).toBe('Planned');
    expect(campaignTone('FAILED')).toBe('bad');
    expect(jobTone('COMPLETED')).toBe('good');
  });

  it('formats counts, percentages and dates', () => {
    expect(formatCount(12345)).toBe('12,345');
    expect(formatPercent(12.25)).toBe('12.3%');
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('garbage')).toBe('—');
    expect(formatDateTime('2026-09-13T12:34:00.000Z')).toMatch(/^2026-09-1\d \d{2}:\d{2}$/);
  });
});
