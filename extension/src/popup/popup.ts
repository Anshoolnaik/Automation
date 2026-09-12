import {
  GET_STATE,
  isStateChangedBroadcast,
  type GetStateRequest,
  type PopupState,
} from '../shared/runtime-messages.js';
import { describeConnection } from './popup-view.js';

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Popup element #${id} is missing`);
  return found;
}

function render(state: PopupState | null): void {
  const connection = describeConnection(state?.connection ?? 'disconnected');
  element('connection').textContent = connection.label;
  element('connection-dot').className = `dot ${connection.className}`;
  element('agent-url').textContent = state ? state.agentUrl : '';
  // textContent only: page titles and URLs are untrusted and never parsed as HTML.
  element('page-title').textContent = state?.currentPage?.title || '—';
  element('page-url').textContent = state?.currentPage?.url || '—';

  const taskSection = element('task-section');
  if (state?.lastTask) {
    taskSection.hidden = false;
    const { command, status, message } = state.lastTask;
    element('task').textContent = `${status}: ${command}${message ? ` — ${message}` : ''}`;
  } else {
    taskSection.hidden = true;
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  if (sender.id === chrome.runtime.id && isStateChangedBroadcast(message)) render(message.state);
});

const request: GetStateRequest = { kind: GET_STATE };
chrome.runtime
  .sendMessage<GetStateRequest, PopupState | null>(request)
  .then(render)
  .catch(() => render(null));
