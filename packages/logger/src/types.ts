export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogMetadata = Record<string, unknown>;

/** A single structured log event. Always sanitized before reaching a transport. */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  taskId?: string;
  metadata?: LogMetadata;
}

export interface LogContext {
  taskId?: string;
  metadata?: LogMetadata;
}

export interface Logger {
  readonly component: string;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Creates a logger for a sub-component, e.g. `browser` -> `browser.playwright`. */
  child(subcomponent: string): Logger;
}

export interface LogTransport {
  /** Entries below this level are not delivered to the transport. */
  readonly minLevel?: LogLevel;
  write(entry: LogEntry): void;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}
