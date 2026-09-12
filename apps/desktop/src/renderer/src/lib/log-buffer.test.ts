import { describe, expect, it } from 'vitest';

import type { LogEntryDto } from '../../../shared/ipc-types';
import { formatLogTime, mergeLogEntries } from './log-buffer';

const entry = (seq: number): LogEntryDto => ({
  seq,
  timestamp: '2026-09-13T12:41:12.000Z',
  level: 'info',
  component: 'test',
  message: `m${seq}`,
});

describe('mergeLogEntries', () => {
  it('de-duplicates and orders by sequence', () => {
    const merged = mergeLogEntries([entry(2), entry(3)], [entry(1), entry(3), entry(4)]);
    expect(merged.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it('keeps only the newest entries', () => {
    const merged = mergeLogEntries([], [entry(1), entry(2), entry(3)], 2);
    expect(merged.map((e) => e.seq)).toEqual([2, 3]);
  });
});

describe('formatLogTime', () => {
  it('formats local wall-clock time as HH:MM:SS', () => {
    expect(formatLogTime('2026-09-13T12:41:12.000Z')).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(formatLogTime('garbage')).toBe('--:--:--');
  });
});
