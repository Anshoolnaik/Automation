import type { LogEntry, LogLevel, LogTransport } from '../types.js';

export type LogListener = (entry: LogEntry) => void;

export interface MemoryTransportOptions {
  /** Maximum number of recent entries retained. */
  capacity?: number;
  minLevel?: LogLevel;
}

/**
 * Keeps a bounded buffer of recent entries and notifies subscribers.
 * The desktop app uses this to feed the activity log UI.
 */
export class MemoryTransport implements LogTransport {
  readonly minLevel: LogLevel | undefined;
  private readonly capacity: number;
  private readonly entries: LogEntry[] = [];
  private readonly listeners = new Set<LogListener>();

  constructor(options: MemoryTransportOptions = {}) {
    this.capacity = Math.max(1, options.capacity ?? 500);
    this.minLevel = options.minLevel;
  }

  write(entry: LogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
    }
    for (const listener of this.listeners) listener(entry);
  }

  recent(): LogEntry[] {
    return [...this.entries];
  }

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
