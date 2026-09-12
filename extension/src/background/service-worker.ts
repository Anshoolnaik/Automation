import {
  AGENT_HOST,
  createExtensionMessage,
  type DesktopToExtensionMessage,
} from '@atlas/agent-protocol';

import {
  STATE_CHANGED,
  isGetStateRequest,
  type ConnectionStatus,
  type PopupState,
  type StateChangedBroadcast,
} from '../shared/runtime-messages.js';
import { AgentConnection } from './agent-connection.js';
import { getActiveTabMetadata, watchActivePage } from './chrome-tabs.js';

const AGENT_URL = `ws://${AGENT_HOST}:${__ATLAS_AGENT_PORT__}`;
const RECONNECT_ALARM = 'atlas-reconnect';

let lastTask: PopupState['lastTask'] = null;

const connection = new AgentConnection({
  url: AGENT_URL,
  extensionVersion: __ATLAS_EXTENSION_VERSION__,
  createSocket: (url) => new WebSocket(url),
  onMessage: (message) => void handleDesktopMessage(message),
  onStatusChange: (status) => void broadcastState(status),
  log: (message) => console.debug(`[atlas] ${message}`),
});

async function handleDesktopMessage(message: DesktopToExtensionMessage): Promise<void> {
  switch (message.type) {
    case 'GET_PAGE_METADATA': {
      const tab = await getActiveTabMetadata().catch(() => null);
      connection.send(
        createExtensionMessage('PAGE_METADATA', { requestId: message.payload.requestId, tab }),
      );
      return;
    }
    case 'TASK_STATUS': {
      const { command, status, message: detail } = message.payload;
      lastTask = { command, status, ...(detail !== undefined && { message: detail }) };
      await broadcastState();
      return;
    }
    case 'PING':
      return; // Answered inside AgentConnection.
  }
}

async function buildState(
  status: ConnectionStatus = connection.currentStatus,
): Promise<PopupState> {
  const tab = await getActiveTabMetadata().catch(() => null);
  return {
    connection: status,
    agentUrl: AGENT_URL,
    currentPage: tab ? { title: tab.title, url: tab.url } : null,
    lastTask,
  };
}

async function broadcastState(status?: ConnectionStatus): Promise<void> {
  const broadcast: StateChangedBroadcast = { kind: STATE_CHANGED, state: await buildState(status) };
  // Rejects when no popup is open; that is expected.
  await chrome.runtime.sendMessage(broadcast).catch(() => undefined);
}

// --- Listeners must be registered synchronously at start-up (Manifest V3). ---

watchActivePage((tab, reason) => {
  connection.send(createExtensionMessage('PAGE_CHANGED', { reason, tab }));
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !isGetStateRequest(message)) return false;
  connection.ensureConnected();
  buildState()
    .then(sendResponse)
    .catch(() => sendResponse(null));
  return true; // Keeps the channel open for the async response.
});

// Service workers can be suspended, losing timers; the alarm brings reconnection back.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RECONNECT_ALARM) connection.ensureConnected();
});

chrome.runtime.onInstalled.addListener(() => connection.ensureConnected());
chrome.runtime.onStartup.addListener(() => connection.ensureConnected());

void chrome.alarms.create(RECONNECT_ALARM, { periodInMinutes: 0.5 });
connection.connect();
