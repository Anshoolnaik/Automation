import type { LogEntry, LogLevel, LogTransport } from '../types.js';

/** Human-readable output for development terminals. */
export class ConsoleTransport implements LogTransport {
  constructor(readonly minLevel: LogLevel = 'debug') {}

  write(entry: LogEntry): void {
    const time = entry.timestamp.slice(11, 23);
    const task = entry.taskId ? ` task=${entry.taskId}` : '';
    const meta = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : '';
    const line = `${time} ${entry.level.toUpperCase().padEnd(5)} [${entry.component}]${task} ${entry.message}${meta}`;
    switch (entry.level) {
      case 'error':
        console.error(line);
        break;
      case 'warn':
        console.warn(line);
        break;
      case 'info':
      case 'debug':
        console.log(line);
        break;
    }
  }
}
