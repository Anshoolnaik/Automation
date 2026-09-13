import type { Migration } from './migration.js';

/**
 * Phase 2: generated search queries and source-specific search jobs.
 * Deduplication is enforced here, not only in application code:
 *   - one query per (campaign, normalized-query hash)
 *   - one job per (campaign, source, query)
 */
export const searchQueriesAndJobsSchema: Migration = {
  version: 3,
  name: 'search_queries_and_jobs',
  up: /* sql */ `
    CREATE TABLE search_queries (
      id                     TEXT PRIMARY KEY,
      campaign_id            TEXT NOT NULL REFERENCES search_campaigns (id) ON DELETE CASCADE,
      country_code           TEXT NOT NULL
                             CHECK (length(country_code) BETWEEN 2 AND 8 AND country_code NOT GLOB '*[^A-Z0-9]*'),
      institution_id         TEXT REFERENCES institutions (id) ON DELETE RESTRICT,
      education_level        TEXT CHECK (education_level IS NULL OR education_level IN (
                               'DIPLOMA', 'ADVANCED_DIPLOMA', 'ASSOCIATE', 'BACHELOR',
                               'POSTGRADUATE_DIPLOMA', 'MASTER', 'DOCTORATE', 'OTHER_HIGHER_EDUCATION')),
      transcript_keyword_id  TEXT NOT NULL CHECK (length(transcript_keyword_id) > 0),
      program                TEXT,
      strategy_id            TEXT NOT NULL CHECK (strategy_id IN (
                               'COUNTRY_BROAD', 'COUNTRY_LEVEL', 'INSTITUTION_BROAD', 'INSTITUTION_LEVEL',
                               'INSTITUTION_KEYWORD_VARIANT', 'PROGRAM_SPECIFIC')),
      query_text             TEXT NOT NULL CHECK (length(trim(query_text)) > 0),
      normalized_query       TEXT NOT NULL CHECK (length(normalized_query) > 0),
      query_hash             TEXT NOT NULL
                             CHECK (length(query_hash) = 64 AND query_hash NOT GLOB '*[^0-9a-f]*'),
      priority               INTEGER NOT NULL,
      created_at             TEXT NOT NULL,
      UNIQUE (campaign_id, query_hash),
      UNIQUE (id, campaign_id)
    );
    CREATE INDEX idx_search_queries_campaign_country ON search_queries (campaign_id, country_code);
    CREATE INDEX idx_search_queries_institution ON search_queries (institution_id);
    CREATE INDEX idx_search_queries_query_hash ON search_queries (query_hash);

    CREATE TABLE search_jobs (
      id                TEXT PRIMARY KEY,
      campaign_id       TEXT NOT NULL REFERENCES search_campaigns (id) ON DELETE CASCADE,
      query_id          TEXT NOT NULL,
      source_id         TEXT NOT NULL REFERENCES search_sources (id) ON DELETE RESTRICT,
      country_code      TEXT NOT NULL
                        CHECK (length(country_code) BETWEEN 2 AND 8 AND country_code NOT GLOB '*[^A-Z0-9]*'),
      institution_id    TEXT REFERENCES institutions (id) ON DELETE RESTRICT,
      status            TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'SKIPPED')),
      priority          INTEGER NOT NULL,
      attempt_count     INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      current_page      INTEGER NOT NULL DEFAULT 0 CHECK (current_page >= 0),
      discovered_count  INTEGER NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
      last_error        TEXT,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL,
      started_at        TEXT,
      completed_at      TEXT,
      UNIQUE (campaign_id, source_id, query_id),
      -- A job always belongs to the same campaign as its query.
      FOREIGN KEY (query_id, campaign_id) REFERENCES search_queries (id, campaign_id) ON DELETE CASCADE
    );
    -- Queue order: highest priority first, then creation order.
    CREATE INDEX idx_search_jobs_queue ON search_jobs (status, priority DESC, created_at);
    CREATE INDEX idx_search_jobs_campaign_status ON search_jobs (campaign_id, status);
    CREATE INDEX idx_search_jobs_campaign_country ON search_jobs (campaign_id, country_code);
    CREATE INDEX idx_search_jobs_source ON search_jobs (source_id);
    CREATE INDEX idx_search_jobs_institution ON search_jobs (institution_id);
    CREATE INDEX idx_search_jobs_query ON search_jobs (query_id);
  `,
};
