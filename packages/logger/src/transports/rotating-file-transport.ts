import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import type { LogEntry, LogLevel, LogTransport } from '../types.js';

export interface RotatingFileTransportOptions {
  directory: string;
  /** Base file name, e.g. `atlas.log`. Rotated files become `atlas.1.log`, `atlas.2.log`, … */
  fileName?: string;
  maxFileSizeBytes?: number;
  /** Total number of files kept, including the active one. */
  maxFiles?: number;
  minLevel?: LogLevel;
  /** Called when a write fails. Defaults to writing to stderr. */
  onError?: (error: unknown) => void;
}

const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;

/**
 * Appends JSON lines to a log file, rotating by size. Writes are serialized
 * through a promise queue so the Electron main thread is never blocked.
 */
export class RotatingFileTransport implements LogTransport {
  readonly minLevel: LogLevel | undefined;
  private readonly directory: string;
  private readonly baseName: string;
  private readonly extension: string;
  private readonly maxFileSizeBytes: number;
  private readonly maxFiles: number;
  private readonly onError: (error: unknown) => void;
  private queue: Promise<void> = Promise.resolve();
  private currentSize: number | undefined;
  private closed = false;

  constructor(options: RotatingFileTransportOptions) {
    const fileName = options.fileName ?? 'atlas.log';
    const parsed = path.parse(fileName);
    this.directory = options.directory;
    this.baseName = parsed.name;
    this.extension = parsed.ext || '.log';
    this.maxFileSizeBytes = Math.max(1024, options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE);
    this.maxFiles = Math.max(1, options.maxFiles ?? DEFAULT_MAX_FILES);
    this.minLevel = options.minLevel;
    this.onError =
      options.onError ??
      ((error) => {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`[atlas-logger] failed to write log file: ${message}\n`);
      });
  }

  get activeFilePath(): string {
    return this.filePathFor(0);
  }

  write(entry: LogEntry): void {
    if (this.closed) return;
    const line = `${JSON.stringify(entry)}\n`;
    this.queue = this.queue.then(() => this.append(line)).catch(this.onError);
  }

  flush(): Promise<void> {
    return this.queue;
  }

  async close(): Promise<void> {
    await this.flush();
    this.closed = true;
  }

  private async append(line: string): Promise<void> {
    const bytes = Buffer.byteLength(line);
    if (this.currentSize === undefined) {
      await mkdir(this.directory, { recursive: true });
      this.currentSize = await fileSize(this.activeFilePath);
    }
    if (this.currentSize > 0 && this.currentSize + bytes > this.maxFileSizeBytes) {
      await this.rotate();
    }
    await appendFile(this.activeFilePath, line, 'utf8');
    this.currentSize += bytes;
  }

  private async rotate(): Promise<void> {
    await rm(this.filePathFor(this.maxFiles - 1), { force: true });
    for (let index = this.maxFiles - 2; index >= 0; index -= 1) {
      const source = this.filePathFor(index);
      if (await exists(source)) {
        await rename(source, this.filePathFor(index + 1));
      }
    }
    this.currentSize = 0;
  }

  private filePathFor(index: number): string {
    const suffix = index === 0 ? '' : `.${index}`;
    return path.join(this.directory, `${this.baseName}${suffix}${this.extension}`);
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileSize(filePath: string): Promise<number> {
  try {
    return (await stat(filePath)).size;
  } catch {
    return 0;
  }
}
