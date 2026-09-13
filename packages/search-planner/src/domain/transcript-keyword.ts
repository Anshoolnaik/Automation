/** One transcript concept and the equivalent terms used to search for it. */
export interface TranscriptKeyword {
  /** Stable identifier, e.g. `statement-of-results`. */
  id: string;
  label: string;
  /** Search terms, primary term first. */
  terms: readonly string[];
  /** 0–100; higher means the concept is more likely to find transcripts. */
  priority: number;
}
