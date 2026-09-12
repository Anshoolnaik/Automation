import type { Logger } from '@atlas/logger';
import type { z } from 'zod';

import { IpcChannel } from '../../shared/ipc-channels.js';
import { EmptyRequestSchema, TaskRunRequestSchema } from '../../shared/ipc-schemas.js';
import type { IpcResult } from '../../shared/ipc-types.js';
import type { AgentFacade } from '../agent-facade.js';
import type { LogBroadcaster, LogSubscriber } from '../logging/log-broadcaster.js';
import { fail, ok, toIpcError } from './ipc-errors.js';

export type IpcHandler = (payload: unknown, sender: LogSubscriber) => Promise<IpcResult<unknown>>;

export interface IpcHandlerDependencies {
  agent: AgentFacade;
  logs: LogBroadcaster;
  logger: Logger;
  /** Returns true once shutdown has begun; new work is then refused. */
  isShuttingDown: () => boolean;
}

/**
 * Pure handler table: validates every payload, calls the agent, and converts
 * all outcomes (including thrown errors) into an {@link IpcResult}.
 */
export function createIpcHandlers(deps: IpcHandlerDependencies): Record<IpcChannel, IpcHandler> {
  const { agent, logs, logger } = deps;

  const handle =
    <S extends z.ZodType>(
      schema: S,
      action: (request: z.output<S>, sender: LogSubscriber) => unknown,
      options: { refuseDuringShutdown?: boolean } = {},
    ): IpcHandler =>
    async (payload, sender) => {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        const message = parsed.error.issues.map((issue) => issue.message).join('; ');
        logger.warn('Rejected invalid IPC request', { metadata: { reason: message } });
        return fail('INVALID_REQUEST', message);
      }
      if (options.refuseDuringShutdown && deps.isShuttingDown()) {
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

  return {
    [IpcChannel.BrowserLaunch]: handle(EmptyRequestSchema, () => agent.launchBrowser(), {
      refuseDuringShutdown: true,
    }),
    [IpcChannel.BrowserStop]: handle(EmptyRequestSchema, () => agent.stopBrowser()),
    [IpcChannel.TaskRun]: handle(
      TaskRunRequestSchema,
      (request) => agent.runTask(request.command),
      {
        refuseDuringShutdown: true,
      },
    ),
    [IpcChannel.AgentGetStatus]: handle(EmptyRequestSchema, () => agent.getStatus()),
    [IpcChannel.ExtensionGetStatus]: handle(EmptyRequestSchema, () => agent.getStatus().extension),
    [IpcChannel.LogsSubscribe]: handle(EmptyRequestSchema, (_request, sender) =>
      logs.subscribe(sender),
    ),
  };
}
