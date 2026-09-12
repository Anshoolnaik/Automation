import type { BrowserEventInput, BrowserEventRecorder } from '@atlas/agent-core';
import type { BrowserEventRepository } from '@atlas/database';
import { redactMetadata, redactText, type Logger } from '@atlas/logger';

/**
 * Persists agent events to SQLite. URLs and details pass through the same
 * redaction as logs so tokens in query strings never reach the database.
 * A persistence failure is logged but never breaks browser control.
 */
export function createDatabaseEventRecorder(
  repository: BrowserEventRepository,
  logger: Logger,
): BrowserEventRecorder {
  return {
    record: (event: BrowserEventInput) => {
      try {
        repository.create({
          eventType: event.type,
          taskId: event.taskId ?? null,
          url: event.url ? redactText(event.url) : null,
          details: event.details ? redactMetadata(event.details) : {},
        });
      } catch (error) {
        logger.error('Failed to persist browser event', {
          ...(event.taskId && { taskId: event.taskId }),
          metadata: { eventType: event.type, error },
        });
      }
    },
  };
}
