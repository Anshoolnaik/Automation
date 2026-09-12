import { existsSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openAtlasDatabase } from './atlas-database.js';
import { MigrationError } from './migrator.js';
import { openSqliteDatabase } from './sqlite/sqlite-database.js';

describe('openAtlasDatabase (file-backed)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'atlas-db-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('creates the data directory and persists across reopen', () => {
    const filePath = path.join(dir, 'data', 'atlas.db');
    const first = openAtlasDatabase({ filePath });
    const task = first.tasks.create({ command: 'Open wikipedia.org' });
    first.close();
    first.close(); // idempotent

    expect(existsSync(filePath)).toBe(true);
    const second = openAtlasDatabase({ filePath });
    try {
      expect(second.migrations.applied).toEqual([]);
      expect(second.tasks.findById(task.id)?.command).toBe('Open wikipedia.org');
    } finally {
      second.close();
    }
  });

  it('uses WAL journaling and enforces foreign keys', () => {
    const filePath = path.join(dir, 'atlas.db');
    openAtlasDatabase({ filePath }).close();
    const raw = openSqliteDatabase(filePath);
    try {
      expect(raw.get('PRAGMA journal_mode')).toEqual({ journal_mode: 'wal' });
      expect(raw.get('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    } finally {
      raw.close();
    }
  });

  it('checkpoints the WAL on close so the main file holds all writes', () => {
    const filePath = path.join(dir, 'atlas.db');
    const db = openAtlasDatabase({ filePath });
    for (let i = 0; i < 20; i += 1) db.browserEvents.create({ eventType: `E${i}` });
    db.close();
    const walPath = `${filePath}-wal`;
    expect(!existsSync(walPath) || statSync(walPath).size === 0).toBe(true);
  });

  it('closes the connection when migration fails', () => {
    const filePath = path.join(dir, 'atlas.db');
    expect(() =>
      openAtlasDatabase({ filePath, migrations: [{ version: 1, name: 'bad', up: 'NOT SQL' }] }),
    ).toThrow(MigrationError);
    // A failed open must not leave the file locked.
    const reopened = openAtlasDatabase({ filePath });
    reopened.close();
  });
});
