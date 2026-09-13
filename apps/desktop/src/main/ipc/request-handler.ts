import type { Logger } from '@atlas/logger';
import type { z } from 'zod';

import type { IpcResult } from '../../shared/ipc-types.js';
import type { LogSubscriber } from '../logging/log-broadcaster.js';
import { fail, ok, toIpcError } from './ipc-errors.js';

export type IpcHandler = (payload: unknown, sender: LogSubscriber) => Promise<IpcResult<unknown>>;

export interface RequestHandlerContext {
  logger: Logger;
  /** Returns true once shutdown has begun; new work is then refused. */
  isShuttingDown: () => boolean;
}

export type RequestHandlerFactory = <S extends z.ZodType>(
  schema: S,
  action: (request: z.output<S>, sender: LogSubscriber) => unknown,
  options?: { refuseDuringShutdown?: boolean },
) => IpcHandler;

/**
 * Every IPC handler follows the same contract: validate the payload with zod,
 * optionally refuse during shutdown, and turn every outcome (including thrown
 * errors) into a sanitized IpcResult.
 */
export function createRequestHandlerFactory(context: RequestHandlerContext): RequestHandlerFactory {
  const { logger } = context;
  return (schema, action, options = {}) =>
    async (payload, sender) => {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        const message = parsed.error.issues
          .map((issue) =>
            issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
          )
          .join('; ');
        logger.warn('Rejected invalid IPC request', { metadata: { reason: message } });
        return fail('INVALID_REQUEST', message);
      }
      if (options.refuseDuringShutdown && context.isShuttingDown()) {
        return fail('SHUTTING_DOWN', 'Atlas Agent is shutting down');
      }
      try {
        const data = await action(parsed.data, sender);
        return ok(data ?? null);
      } catch (error) {
        const ipcError = toIpcError(error);
        logger.error('IPC request failed', { metadata: { code: ipcError.code, error } });
        return { ok: false, error: ipcError };
      }
    };
}
