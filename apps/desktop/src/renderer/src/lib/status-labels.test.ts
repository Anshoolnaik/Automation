import { describe, expect, it } from 'vitest';

import {
  agentStatusView,
  browserStatusView,
  canLaunchBrowser,
  canRunTask,
  canStopBrowser,
  extensionStatusView,
} from './status-labels';

describe('status labels', () => {
  it('matches the labels required by the Phase-1 UI', () => {
    expect(agentStatusView('IDLE').label).toBe('Idle');
    expect(browserStatusView('STOPPED').label).toBe('Not Running');
    expect(browserStatusView('DISCONNECTED').label).toBe('Disconnected');
    expect(extensionStatusView('CONNECTED').label).toBe('Connected');
  });

  it('enables controls only in sensible states', () => {
    expect(canLaunchBrowser('STOPPED')).toBe(true);
    expect(canLaunchBrowser('STARTING')).toBe(false);
    expect(canLaunchBrowser('RUNNING')).toBe(false);
    expect(canStopBrowser('RUNNING')).toBe(true);
    expect(canStopBrowser('STOPPED')).toBe(false);
    expect(canRunTask('IDLE', 'RUNNING')).toBe(true);
    expect(canRunTask('ERROR', 'RUNNING')).toBe(true);
    expect(canRunTask('RUNNING', 'RUNNING')).toBe(false);
    expect(canRunTask('IDLE', 'STOPPED')).toBe(false);
  });
});
