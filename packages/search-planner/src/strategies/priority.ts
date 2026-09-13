import type { TranscriptKeyword } from '../domain/transcript-keyword.js';

/**
 * Priority scoring. Higher = more valuable = should be searched earlier.
 *
 *   priority = base(kind) + floor(keyword.priority / 10) - 2 × variantIndex
 *
 * - base separates query kinds by at least 50 points, so the bonus (0–10) and
 *   the variant penalty (0–8) never reorder kinds.
 * - keyword bonus prefers stronger transcript terms ("transcript" over
 *   "academic statement").
 * - variantIndex is the position of a secondary spelling or level term
 *   ("academic records" after "academic record", "BSc" after "bachelor").
 *
 * Priorities are scores, not positions: the queue orders by them, but nothing
 * depends on specific values.
 */
export const PRIORITY_BASE = {
  INSTITUTION_BROAD: 900,
  INSTITUTION_PROGRAM: 850,
  INSTITUTION_LEVEL: 800,
  COUNTRY_PROGRAM: 650,
  COUNTRY_BROAD: 600,
  COUNTRY_LEVEL: 500,
  INSTITUTION_KEYWORD_VARIANT: 400,
} as const;

export type PriorityKind = keyof typeof PRIORITY_BASE;

export function scorePriority(
  kind: PriorityKind,
  keyword: TranscriptKeyword,
  variantIndex = 0,
): number {
  const keywordBonus = Math.floor(Math.min(100, Math.max(0, keyword.priority)) / 10);
  const variantPenalty = Math.min(Math.max(0, variantIndex), 4) * 2;
  return PRIORITY_BASE[kind] + keywordBonus - variantPenalty;
}
