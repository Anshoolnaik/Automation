import type { LogEntry, MemoryTransport } from '@atlas/logger';

import type { LogEntryDto } from '../../shared/ipc-types.js';

/** A renderer that receives live log entries (backed by a WebContents in production). */
export interface LogSubscriber {
  readonly id: number;
  isDestroyed(): boolean;
  send(entry: LogEntryDto): void;
}

/**
 * Bridges the in-memory log transport to subscribed renderers. Entries get a
 * stable sequence number so the UI can merge the backlog with live entries.
 */
export class LogBroadcaster {
  private nextSeq = 1;
  private readonly sequenceByEntry = new WeakMap<LogEntry, number>();
  private readonly subscribers = new Map<number, LogSubscriber>();
  private readonly detach: () => void;

  constructor(private readonly memory: MemoryTransport) {
    this.detach = memory.subscribe((entry) => this.deliver(entry));
  }

  /** Registers a subscriber and returns the recent backlog. */
  subscribe(subscriber: LogSubscriber): LogEntryDto[] {
    this.subscribers.set(subscriber.id, subscriber);
    return this.memory.recent().map((entry) => this.toDto(entry));
  }

  unsubscribe(subscriberId: number): void {
    this.subscribers.delete(subscriberId);
  }

  dispose(): void {
    this.detach();
    this.subscribers.clear();
  }

  private deliver(entry: LogEntry): void {
    if (this.subscribers.size === 0) return;
    const dto = this.toDto(entry);
    for (const [id, subscriber] of this.subscribers) {
      if (subscriber.isDestroyed()) {
        this.subscribers.delete(id);
        continue;
      }
      subscriber.send(dto);
    }
  }

  private toDto(entry: LogEntry): LogEntryDto {
    let seq = this.sequenceByEntry.get(entry);
    if (seq === undefined) {
      seq = this.nextSeq++;
      this.sequenceByEntry.set(entry, seq);
    }
    const dto: LogEntryDto = {
      seq,
      timestamp: entry.timestamp,
      level: entry.level,
      component: entry.component,
      message: entry.message,
    };
    if (entry.taskId) dto.taskId = entry.taskId;
    return dto;
  }
}
