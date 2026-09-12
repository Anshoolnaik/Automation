import { isLevelEnabled } from './levels.js';
import { redactMetadata, redactText } from './redact.js';
import type { LogContext, LogEntry, LogLevel, LogTransport, Logger } from './types.js';

export interface LoggerOptions {
  transports: readonly LogTransport[];
  /** Global minimum level; transports may filter further. Defaults to `info`. */
  minLevel?: LogLevel;
  now?: () => Date;
}

/** Owns transports. Hand out component loggers with {@link LogManager.forComponent}. */
export interface LogManager {
  forComponent(component: string): Logger;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export function createLogManager(options: LoggerOptions): LogManager {
  const minLevel = options.minLevel ?? 'info';
  const now = options.now ?? (() => new Date());
  const transports = [...options.transports];

  const emit = (level: LogLevel, component: string, message: string, context?: LogContext) => {
    if (!isLevelEnabled(level, minLevel)) return;
    const entry = buildEntry(level, component, message, now(), context);
    for (const transport of transports) {
      if (transport.minLevel && !isLevelEnabled(level, transport.minLevel)) continue;
      try {
        transport.write(entry);
      } catch (error) {
        // A broken transport must not break the application or other transports.
        reportTransportFailure(error);
      }
    }
  };

  const makeLogger = (component: string): Logger => ({
    component,
    debug: (message, context) => emit('debug', component, message, context),
    info: (message, context) => emit('info', component, message, context),
    warn: (message, context) => emit('warn', component, message, context),
    error: (message, context) => emit('error', component, message, context),
    child: (subcomponent) => makeLogger(`${component}.${subcomponent}`),
  });

  return {
    forComponent: makeLogger,
    flush: async () => {
      await Promise.all(transports.flatMap((transport) => transport.flush?.() ?? []));
    },
    close: async () => {
      await Promise.all(transports.flatMap((transport) => transport.close?.() ?? []));
    },
  };
}

function buildEntry(
  level: LogLevel,
  component: string,
  message: string,
  timestamp: Date,
  context?: LogContext,
): LogEntry {
  const entry: LogEntry = {
    timestamp: timestamp.toISOString(),
    level,
    component,
    message: redactText(message),
  };
  if (context?.taskId) entry.taskId = context.taskId;
  if (context?.metadata && Object.keys(context.metadata).length > 0) {
    entry.metadata = redactMetadata(context.metadata);
  }
  return entry;
}

function reportTransportFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[atlas-logger] transport failure: ${message}\n`);
}

/** A logger that discards everything. Useful as a default in tests. */
export function createNoopLogger(component = 'noop'): Logger {
  const noop = () => undefined;
  const logger: Logger = {
    component,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: (subcomponent) => createNoopLogger(`${component}.${subcomponent}`),
  };
  return logger;
}
