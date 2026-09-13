import type { Migration } from './migration.js';

/**
 * Phase 2: search sources, campaigns and institutions.
 * Status lists are written out literally: a migration is a frozen snapshot and
 * must not change when domain constants evolve.
 */
export const searchCampaignsSchema: Migration = {
  version: 2,
  name: 'search_campaigns',
  up: /* sql */ `
    CREATE TABLE search_sources (
      id          TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64),
      name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
      base_url    TEXT NOT NULL CHECK (base_url LIKE 'https://%' OR base_url LIKE 'http://%'),
      enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      created_at  TEXT NOT NULL
    );

    -- Configured source only: no automation exists for it in Phase 2.
    INSERT INTO search_sources (id, name, base_url, enabled, created_at)
    VALUES ('scribd', 'Scribd', 'https://www.scribd.com', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

    CREATE TABLE search_campaigns (
      id                 TEXT PRIMARY KEY,
      name               TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
      status             TEXT NOT NULL
                         CHECK (status IN ('DRAFT', 'PLANNED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED')),
      intent_json        TEXT NOT NULL CHECK (json_valid(intent_json)),
      source_ids_json    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(source_ids_json)),
      plan_summary_json  TEXT CHECK (plan_summary_json IS NULL OR json_valid(plan_summary_json)),
      last_error         TEXT,
      created_at         TEXT NOT NULL,
      updated_at         TEXT NOT NULL,
      planned_at         TEXT,
      started_at         TEXT,
      completed_at       TEXT
    );
    CREATE INDEX idx_search_campaigns_status ON search_campaigns (status);
    CREATE INDEX idx_search_campaigns_created_at ON search_campaigns (created_at);

    CREATE TABLE institutions (
      id                TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 120),
      country_code      TEXT NOT NULL
                        CHECK (length(country_code) BETWEEN 2 AND 8 AND country_code NOT GLOB '*[^A-Z0-9]*'),
      name              TEXT NOT NULL CHECK (length(trim(name)) > 0),
      normalized_name   TEXT NOT NULL CHECK (length(normalized_name) > 0),
      aliases_json      TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(aliases_json)),
      institution_type  TEXT NOT NULL
                        CHECK (institution_type IN ('UNIVERSITY', 'COLLEGE', 'POLYTECHNIC', 'INSTITUTE', 'OTHER')),
      source            TEXT NOT NULL,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL,
      UNIQUE (country_code, normalized_name)
    );
    CREATE INDEX idx_institutions_country_code ON institutions (country_code);
  `,
};
