import type { ConnectionStatus } from '../shared/runtime-messages.js';

export function describeConnection(status: ConnectionStatus): { label: string; className: string } {
  switch (status) {
    case 'connected':
      return { label: 'Connected', className: 'connected' };
    case 'connecting':
      return { label: 'Connecting…', className: 'connecting' };
    case 'disconnected':
      return { label: 'Disconnected', className: 'disconnected' };
  }
}
