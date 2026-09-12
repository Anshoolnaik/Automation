import { TASK_STATUSES, TERMINAL_TASK_STATUSES } from '@atlas/agent-protocol';
import { describe, expect, it, vi } from 'vitest';

import { InvalidStateTransitionError, isTerminal } from './state-machine.js';
import {
  TASK_TRANSITIONS,
  createAgentStateMachine,
  createBrowserStateMachine,
  createExtensionStateMachine,
  createTaskStateMachine,
} from './transitions.js';

describe('task state machine', () => {
  it('follows the happy path PENDING -> RUNNING -> COMPLETED', () => {
    const task = createTaskStateMachine();
    task.transition('RUNNING');
    task.transition('COMPLETED');
    expect(task.state).toBe('COMPLETED');
  });

  it.each([
    ['RUNNING', 'FAILED'],
    ['RUNNING', 'CANCELLED'],
    ['PENDING', 'FAILED'],
    ['PENDING', 'CANCELLED'],
  ] as const)('allows %s -> %s', (from, to) => {
    const task = createTaskStateMachine();
    if (from === 'RUNNING') task.transition('RUNNING');
    expect(task.canTransition(to)).toBe(true);
  });

  it('forbids skipping RUNNING and leaving terminal states', () => {
    const task = createTaskStateMachine();
    expect(() => task.transition('COMPLETED')).toThrow(InvalidStateTransitionError);
    task.transition('RUNNING');
    task.transition('FAILED');
    expect(() => task.transition('RUNNING')).toThrow(
      'Invalid task state transition: FAILED -> RUNNING',
    );
  });

  it('marks exactly the shared terminal statuses as terminal', () => {
    for (const status of TASK_STATUSES) {
      expect(isTerminal(TASK_TRANSITIONS, status)).toBe(TERMINAL_TASK_STATUSES.has(status));
    }
  });
});

describe('agent state machine', () => {
  it('moves between idle, running and error, and stops for good', () => {
    const agent = createAgentStateMachine();
    agent.transition('RUNNING');
    agent.transition('ERROR');
    agent.transition('RUNNING');
    agent.transition('IDLE');
    agent.transition('STOPPED');
    expect(agent.canTransition('IDLE')).toBe(false);
  });

  it('cannot fail without running first', () => {
    expect(() => createAgentStateMachine().transition('ERROR')).toThrow(
      InvalidStateTransitionError,
    );
  });
});

describe('browser state machine', () => {
  it('supports launch, unexpected disconnect and relaunch', () => {
    const browser = createBrowserStateMachine();
    const changes = vi.fn();
    browser.onChange(changes);
    browser.transition('STARTING');
    browser.transition('RUNNING');
    browser.transition('DISCONNECTED');
    browser.transition('STARTING');
    browser.transition('ERROR');
    browser.transition('STOPPED');
    expect(changes).toHaveBeenCalledTimes(6);
    expect(changes).toHaveBeenNthCalledWith(3, 'DISCONNECTED', 'RUNNING');
  });

  it('cannot run without starting', () => {
    expect(() => createBrowserStateMachine().transition('RUNNING')).toThrow(
      InvalidStateTransitionError,
    );
  });
});

describe('extension state machine', () => {
  it('toggles between connected and disconnected only', () => {
    const extension = createExtensionStateMachine();
    extension.transition('CONNECTED');
    expect(() => extension.transition('CONNECTED')).toThrow(InvalidStateTransitionError);
    extension.transition('DISCONNECTED');
    expect(extension.is('DISCONNECTED')).toBe(true);
  });
});
