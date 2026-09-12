import type { PlannedStep } from '../types.js';

/** Knows how to search one website with generic browser actions. */
export interface SiteSearchHandler {
  readonly siteName: string;
  matches(url: URL): boolean;
  planSearch(url: URL, query: string): PlannedStep[];
}
