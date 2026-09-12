import type { AgentState, BrowserState, ExtensionState } from '@atlas/agent-protocol';

export type StatusTone = 'neutral' | 'busy' | 'good' | 'bad';

export interface StatusView {
  label: string;
  tone: StatusTone;
}

const AGENT: Record<AgentState, StatusView> = {
  IDLE: { label: 'Idle', tone: 'neutral' },
  RUNNING: { label: 'Running', tone: 'busy' },
  STOPPED: { label: 'Stopped', tone: 'neutral' },
  ERROR: { label: 'Error', tone: 'bad' },
};

const BROWSER: Record<BrowserState, StatusView> = {
  STOPPED: { label: 'Not Running', tone: 'neutral' },
  STARTING: { label: 'Starting', tone: 'busy' },
  RUNNING: { label: 'Running', tone: 'good' },
  DISCONNECTED: { label: 'Disconnected', tone: 'bad' },
  ERROR: { label: 'Error', tone: 'bad' },
};

const EXTENSION: Record<ExtensionState, StatusView> = {
  CONNECTED: { label: 'Connected', tone: 'good' },
  DISCONNECTED: { label: 'Disconnected', tone: 'neutral' },
};

export const agentStatusView = (state: AgentState): StatusView => AGENT[state];
export const browserStatusView = (state: BrowserState): StatusView => BROWSER[state];
export const extensionStatusView = (state: ExtensionState): StatusView => EXTENSION[state];

export function canLaunchBrowser(state: BrowserState): boolean {
  return state === 'STOPPED' || state === 'DISCONNECTED' || state === 'ERROR';
}

export function canStopBrowser(state: BrowserState): boolean {
  return state === 'RUNNING';
}

export function canRunTask(agent: AgentState, browser: BrowserState): boolean {
  return browser === 'RUNNING' && agent !== 'RUNNING' && agent !== 'STOPPED';
}
