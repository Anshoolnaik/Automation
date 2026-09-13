import type { Logger } from '@atlas/logger';

import { IpcChannel } from '../../shared/ipc-channels.js';
import { EmptyRequestSchema, TaskRunRequestSchema } from '../../shared/ipc-schemas.js';
import type { AgentFacade } from '../agent-facade.js';
import type { LogBroadcaster } from '../logging/log-broadcaster.js';
import type { SearchFacade } from '../search/search-facade.js';
import { createRequestHandlerFactory, type IpcHandler } from './request-handler.js';
import { createSearchIpcHandlers } from './search-ipc-handlers.js';

export type { IpcHandler } from './request-handler.js';

export interface IpcHandlerDependencies {
  agent: AgentFacade;
  search: SearchFacade;
  logs: LogBroadcaster;
  logger: Logger;
  /** Returns true once shutdown has begun; new work is then refused. */
  isShuttingDown: () => boolean;
}

/**
 * Pure handler table: validates every payload, calls the agent, and converts
 * all outcomes (including thrown errors) into an IpcResult.
 */
export function createIpcHandlers(deps: IpcHandlerDependencies): Record<IpcChannel, IpcHandler> {
  const { agent, logs } = deps;
  const handle = createRequestHandlerFactory(deps);

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
    ...createSearchIpcHandlers(deps.search, handle),
  };
}
