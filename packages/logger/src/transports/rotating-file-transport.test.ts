import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LogEntry } from '../types.js';
import { RotatingFileTransport } from './rotating-file-transport.js';

function entry(message: string): LogEntry {
  return { timestamp: '2026-09-13T00:00:00.000Z', level: 'info', component: 'test', message };
}

describe('RotatingFileTransport', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'atlas-logs-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('writes JSON lines and creates the directory lazily', async () => {
    const logDir = path.join(directory, 'nested', 'logs');
    const transport = new RotatingFileTransport({ directory: logDir });
    transport.write(entry('one'));
    transport.write(entry('two'));
    await transport.flush();

    const lines = (await readFile(transport.activeFilePath, 'utf8')).trim().split('\n');
    expect(lines.map((line) => (JSON.parse(line) as LogEntry).message)).toEqual(['one', 'two']);
  });

  it('rotates by size and keeps at most maxFiles files', async () => {
    const transport = new RotatingFileTransport({
      directory,
      fileName: 'atlas.log',
      maxFileSizeBytes: 1024,
      maxFiles: 3,
    });
    const bigMessage = 'x'.repeat(600);
    for (let i = 0; i < 6; i += 1) transport.write(entry(`${i}-${bigMessage}`));
    await transport.close();

    const files = (await readdir(directory)).sort();
    expect(files).toEqual(['atlas.1.log', 'atlas.2.log', 'atlas.log']);
    const newest = await readFile(path.join(directory, 'atlas.log'), 'utf8');
    expect(newest).toContain('"5-');
  });

  it('ignores writes after close', async () => {
    const transport = new RotatingFileTransport({ directory });
    await transport.close();
    transport.write(entry('late'));
    await transport.flush();
    expect(await readdir(directory)).toEqual([]);
  });
});
