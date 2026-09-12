import type { LogEntryDto } from '../../../shared/ipc-types';

export const MAX_UI_LOG_ENTRIES = 500;

/** Merges entries by sequence number, keeping order and the newest `limit` entries. */
export function mergeLogEntries(
  existing: readonly LogEntryDto[],
  incoming: readonly LogEntryDto[],
  limit = MAX_UI_LOG_ENTRIES,
): LogEntryDto[] {
  if (incoming.length === 0) return [...existing];
  const bySeq = new Map<number, LogEntryDto>();
  for (const entry of existing) bySeq.set(entry.seq, entry);
  for (const entry of incoming) bySeq.set(entry.seq, entry);
  const merged = [...bySeq.values()].sort((a, b) => a.seq - b.seq);
  return merged.length > limit ? merged.slice(merged.length - limit) : merged;
}

export function formatLogTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
