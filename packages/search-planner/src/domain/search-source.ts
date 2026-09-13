/**
 * A website (or other search backend) that search jobs can run against.
 * Phase 2 only records configuration; no source is automated yet.
 */
export interface SearchSource {
  id: string;
  name: string;
  enabled: boolean;
  baseUrl: string;
}
