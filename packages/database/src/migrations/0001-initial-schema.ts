import type { Migration } from './migration.js';

export const initialSchema: Migration = {
  version: 1,
  name: 'initial_schema',
  up: /* sql */ `
    CREATE TABLE agent_runs (
      id          TEXT PRIMARY KEY,
      started_at  TEXT NOT NULL,
      ended_at    TEXT,
      status      TEXT NOT NULL CHECK (status IN ('RUNNING', 'STOPPED', 'ABORTED'))
    );

    CREATE TABLE tasks (
      id             TEXT PRIMARY KEY,
      agent_run_id   TEXT REFERENCES agent_runs (id) ON DELETE SET NULL,
      command        TEXT NOT NULL,
      status         TEXT NOT NULL
                     CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
      created_at     TEXT NOT NULL,
      started_at     TEXT,
      completed_at   TEXT,
      error_message  TEXT
    );
    CREATE INDEX idx_tasks_created_at ON tasks (created_at);
    CREATE INDEX idx_tasks_status ON tasks (status);

    CREATE TABLE browser_events (
      id          TEXT PRIMARY KEY,
      task_id     TEXT REFERENCES tasks (id) ON DELETE CASCADE,
      event_type  TEXT NOT NULL,
      url         TEXT,
      details     TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details)),
      created_at  TEXT NOT NULL
    );
    CREATE INDEX idx_browser_events_task_id ON browser_events (task_id);
    CREATE INDEX idx_browser_events_created_at ON browser_events (created_at);

    CREATE TABLE checkpoints (
      id               TEXT PRIMARY KEY,
      task_id          TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
      checkpoint_type  TEXT NOT NULL,
      data_json        TEXT NOT NULL CHECK (json_valid(data_json)),
      created_at       TEXT NOT NULL
    );
    CREATE INDEX idx_checkpoints_task_id ON checkpoints (task_id);
  `,
};
