import type { AgentStatusSnapshot } from '../shared/ipc-types.js';
import type { AgentFacade } from './agent-facade.js';

/** Placeholder used until the browser automation layer is wired in. */
export function createShellAgentFacade(): AgentFacade {
  const snapshot: AgentStatusSnapshot = {
    agent: 'IDLE',
    browser: 'STOPPED',
    extension: { state: 'DISCONNECTED' },
  };
  const notAvailable = () => Promise.reject(new Error('Browser automation is not available yet'));
  return {
    getStatus: () => snapshot,
    onStatusChanged: () => () => undefined,
    launchBrowser: notAvailable,
    stopBrowser: notAvailable,
    runTask: notAvailable,
  };
}
