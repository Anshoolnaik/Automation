import type {
  ExtensionChannel,
  ExtensionConnection,
  PageInfo,
  TaskStatusNotification,
} from '@atlas/agent-core';
import { createDesktopMessage, type TabMetadata } from '@atlas/agent-protocol';
import type { AgentServer } from '@atlas/agent-server';
import type { Logger } from '@atlas/logger';

/** Adapts the WebSocket AgentServer to agent-core's ExtensionChannel port. */
export class WebSocketExtensionChannel implements ExtensionChannel {
  private readonly pageListeners = new Set<(page: PageInfo) => void>();
  private readonly detach: Array<() => void>;

  constructor(
    private readonly server: AgentServer,
    private readonly logger: Logger,
  ) {
    this.detach = [
      server.onConnectionChange((connection) => {
        if (connection.state === 'CONNECTED') void this.refreshActivePage();
      }),
      server.onMessage((message) => {
        if (message.type === 'PAGE_CHANGED') this.publishPage(message.payload.tab);
      }),
    ];
  }

  get connection(): ExtensionConnection {
    return this.server.connection;
  }

  onConnectionChange(listener: (connection: ExtensionConnection) => void): () => void {
    return this.server.onConnectionChange(listener);
  }

  onActivePageChanged(listener: (page: PageInfo) => void): () => void {
    this.pageListeners.add(listener);
    return () => {
      this.pageListeners.delete(listener);
    };
  }

  notifyTaskStatus(update: TaskStatusNotification): void {
    const payload = {
      taskId: update.taskId,
      status: update.status,
      command: update.command.slice(0, 500),
      ...(update.message && { message: update.message.slice(0, 1000) }),
    };
    this.server.send(createDesktopMessage('TASK_STATUS', payload));
  }

  dispose(): void {
    for (const detach of this.detach) detach();
    this.pageListeners.clear();
  }

  private async refreshActivePage(): Promise<void> {
    try {
      const tab = await this.server.requestPageMetadata();
      if (tab) this.publishPage(tab);
    } catch (error) {
      this.logger.debug('Could not read active page from extension', { metadata: { error } });
    }
  }

  private publishPage(tab: TabMetadata): void {
    const page: PageInfo = { title: tab.title, url: tab.url };
    for (const listener of this.pageListeners) listener(page);
  }
}
