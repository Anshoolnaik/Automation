import type { Logger } from '@atlas/logger';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

import { IpcEvent, type IpcChannel } from '../../shared/ipc-channels.js';
import type { LogSubscriber } from '../logging/log-broadcaster.js';
import { fail } from './ipc-errors.js';
import type { IpcHandler } from './ipc-handlers.js';

export interface RegisterIpcOptions {
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>;
  handlers: Record<IpcChannel, IpcHandler>;
  isTrustedUrl: (url: string | undefined) => boolean;
  logger: Logger;
}

/** Binds the whitelisted handlers to ipcMain. Returns a function that removes them. */
export function registerIpcHandlers(options: RegisterIpcOptions): () => void {
  const { ipcMain, handlers, isTrustedUrl, logger } = options;
  const channels = Object.keys(handlers) as IpcChannel[];

  for (const channel of channels) {
    const handler = handlers[channel];
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const senderUrl = event.senderFrame?.url;
      if (!isTrustedUrl(senderUrl)) {
        logger.warn('Blocked IPC call from untrusted sender', { metadata: { channel } });
        return fail('UNTRUSTED_SENDER', 'IPC sender is not the Atlas renderer');
      }
      if (args.length > 1) {
        return fail('INVALID_REQUEST', 'Expected at most one payload argument');
      }
      return handler(args[0], toLogSubscriber(event));
    });
  }

  return () => {
    for (const channel of channels) ipcMain.removeHandler(channel);
  };
}

function toLogSubscriber(event: IpcMainInvokeEvent): LogSubscriber {
  const { sender } = event;
  return {
    id: sender.id,
    isDestroyed: () => sender.isDestroyed(),
    send: (entry) => sender.send(IpcEvent.LogEntry, entry),
  };
}
