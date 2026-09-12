#!/usr/bin/env node
// Prints recent Atlas tasks and browser events from the SQLite database (read-only).
// Usage: pnpm db:inspect [path/to/atlas.db]
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';

function defaultUserDataDir() {
  if (process.env.ATLAS_USER_DATA_DIR) return path.resolve(process.env.ATLAS_USER_DATA_DIR);
  const home = os.homedir();
  switch (process.platform) {
    case 'win32':
      return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Atlas Agent');
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'Atlas Agent');
    default:
      return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'Atlas Agent');
  }
}

const filePath = process.argv[2] ?? path.join(defaultUserDataDir(), 'data', 'atlas.db');
if (!existsSync(filePath)) {
  process.stderr.write(`No Atlas database found at ${filePath}\n`);
  process.exit(1);
}

const db = new DatabaseSync(filePath, { readOnly: true });
try {
  process.stdout.write(`Database: ${filePath}\n\nRecent agent runs\n`);
  console.table(
    db
      .prepare(
        'SELECT started_at, ended_at, status FROM agent_runs ORDER BY started_at DESC LIMIT 5',
      )
      .all(),
  );
  process.stdout.write('\nRecent tasks\n');
  console.table(
    db
      .prepare(
        'SELECT id, command, status, started_at, completed_at, error_message FROM tasks ORDER BY created_at DESC LIMIT 10',
      )
      .all(),
  );
  process.stdout.write('\nRecent browser events\n');
  console.table(
    db
      .prepare(
        'SELECT created_at, event_type, task_id, url FROM browser_events ORDER BY created_at DESC, rowid DESC LIMIT 20',
      )
      .all(),
  );
  const checkpoints = db.prepare('SELECT COUNT(*) AS count FROM checkpoints').get();
  process.stdout.write(`\nCheckpoints stored: ${checkpoints?.count ?? 0}\n`);
} finally {
  db.close();
}
