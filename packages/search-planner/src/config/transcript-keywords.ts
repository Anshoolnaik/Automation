import type { TranscriptKeyword } from '../domain/transcript-keyword.js';

/**
 * Canonical transcript terminology, highest priority first. Terms inside one
 * keyword are equivalent spellings; the first term is the primary one.
 */
export const TRANSCRIPT_KEYWORDS: readonly TranscriptKeyword[] = [
  { id: 'transcript', label: 'Transcript', terms: ['transcript'], priority: 100 },
  {
    id: 'academic-transcript',
    label: 'Academic transcript',
    terms: ['academic transcript'],
    priority: 95,
  },
  {
    id: 'academic-record',
    label: 'Academic record',
    terms: ['academic record', 'academic records'],
    priority: 90,
  },
  {
    id: 'statement-of-results',
    label: 'Statement of results',
    terms: ['statement of results', 'statement of result'],
    priority: 85,
  },
  {
    id: 'mark-sheet',
    label: 'Mark sheet',
    terms: ['mark sheet', 'marksheet', 'mark sheets', 'marksheets'],
    priority: 80,
  },
  {
    id: 'grade-sheet',
    label: 'Grade sheet',
    terms: ['grade sheet', 'grade sheets'],
    priority: 75,
  },
  {
    id: 'degree-transcript',
    label: 'Degree transcript',
    terms: ['degree transcript'],
    priority: 70,
  },
  {
    id: 'university-transcript',
    label: 'University transcript',
    terms: ['university transcript'],
    priority: 65,
  },
  {
    id: 'college-transcript',
    label: 'College transcript',
    terms: ['college transcript'],
    priority: 60,
  },
  {
    id: 'academic-statement',
    label: 'Academic statement',
    terms: ['academic statement'],
    priority: 55,
  },
];

export const ALL_TRANSCRIPT_KEYWORD_IDS: readonly string[] = TRANSCRIPT_KEYWORDS.map(
  (keyword) => keyword.id,
);
