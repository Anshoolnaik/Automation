import type { PageInfo } from '../agent-status.js';
import type { ExtensionChannel, ExtensionConnection, TaskStatusNotification } from '../ports.js';

/** In-memory ExtensionChannel for unit tests. */
export class FakeExtensionChannel implements ExtensionChannel {
  connection: ExtensionConnection = { state: 'DISCONNECTED' };
  readonly notifications: TaskStatusNotification[] = [];
  private readonly connectionListeners = new Set<(connection: ExtensionConnection) => void>();
  private readonly pageListeners = new Set<(page: PageInfo) => void>();

  onConnectionChange(listener: (connection: ExtensionConnection) => void): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  onActivePageChanged(listener: (page: PageInfo) => void): () => void {
    this.pageListeners.add(listener);
    return () => this.pageListeners.delete(listener);
  }

  notifyTaskStatus(update: TaskStatusNotification): void {
    this.notifications.push(update);
  }

  connect(extensionVersion = '0.1.0'): void {
    this.connection = {
      state: 'CONNECTED',
      extensionVersion,
      connectedAt: '2026-09-13T00:00:00.000Z',
    };
    for (const listener of this.connectionListeners) listener(this.connection);
  }

  disconnect(): void {
    this.connection = { state: 'DISCONNECTED' };
    for (const listener of this.connectionListeners) listener(this.connection);
  }

  changePage(page: PageInfo): void {
    for (const listener of this.pageListeners) listener(page);
  }
}
