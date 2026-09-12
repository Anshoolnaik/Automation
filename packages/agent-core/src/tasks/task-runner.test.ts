import { BrowserError } from '@atlas/browser-core';
import { afterEach, describe, expect, it } from 'vitest';

import { createTestAgent } from '../testing/create-test-agent.js';

const DEMO = 'Open wikipedia.org and search for Alan Turing';

describe('TaskRunner', () => {
  let agent: ReturnType<typeof createTestAgent>;

  afterEach(() => {
    agent?.database.close();
  });

  async function readyAgent() {
    agent = createTestAgent();
    await agent.browser.launch();
    agent.controller.title = 'Alan Turing - Wikipedia';
    return agent;
  }

  it('runs the Phase-1 demo: persists the task, executes actions, logs and checkpoints', async () => {
    const { tasks, database, controller, logs, agentRunId } = await readyAgent();

    const outcome = await tasks.run(DEMO);

    expect(outcome).toMatchObject({ status: 'COMPLETED', finalTitle: 'Alan Turing - Wikipedia' });
    expect(controller.calls.slice(1)).toEqual([
      ['goto', 'https://www.wikipedia.org/'],
      ['type', '#searchInput', 'Alan Turing'],
      ['press', '#searchInput', 'Enter'],
    ]);

    const task = database.tasks.findById(outcome.taskId);
    expect(task).toMatchObject({
      command: DEMO,
      status: 'COMPLETED',
      agentRunId,
      errorMessage: null,
    });
    expect(task?.startedAt).not.toBeNull();
    expect(task?.completedAt).not.toBeNull();

    const events = database.browserEvents.listByTask(outcome.taskId);
    expect(events.map((event) => event.eventType)).toEqual([
      'ACTION_STARTED',
      'ACTION_COMPLETED',
      'ACTION_STARTED',
      'ACTION_COMPLETED',
      'ACTION_STARTED',
      'ACTION_COMPLETED',
    ]);
    // Typed values are not stored; only their length.
    expect(JSON.stringify(events)).not.toContain('Alan Turing');
    expect(events[3]?.details).toMatchObject({ actionType: 'fill', valueLength: 11 });

    const checkpoints = database.checkpoints.listByTask(outcome.taskId);
    expect(checkpoints.map((c) => c.checkpointType)).toEqual([
      'STEP_COMPLETED',
      'STEP_COMPLETED',
      'STEP_COMPLETED',
      'TASK_RESULT',
    ]);

    const messages = logs
      .recent()
      .filter((e) => e.taskId === outcome.taskId)
      .map((e) => e.message);
    expect(messages).toEqual([
      `Task received: ${DEMO}`,
      'Opening wikipedia.org',
      'Searching for Alan Turing',
      'Submitting search',
      'Task completed: Alan Turing - Wikipedia',
    ]);
  });

  it('moves the task state machine through PENDING -> RUNNING -> COMPLETED', async () => {
    const { tasks } = await readyAgent();
    const seen: string[] = [];
    tasks.onTaskUpdate((task) => seen.push(task.status));
    await tasks.run('Open wikipedia.org');
    expect(seen).toEqual(['PENDING', 'RUNNING', 'COMPLETED']);
    expect(tasks.currentTask).toBeUndefined();
  });

  it('fails unsupported commands with a sanitized, persisted error', async () => {
    const { tasks, database, controller, logs } = await readyAgent();
    const outcome = await tasks.run('Book me a flight');

    expect(outcome.status).toBe('FAILED');
    expect(outcome.errorMessage).toContain('only understands a few simple commands');
    expect(database.tasks.findById(outcome.taskId)).toMatchObject({
      status: 'FAILED',
      errorMessage: outcome.errorMessage,
    });
    expect(controller.calls).toEqual([['launch']]);
    expect(logs.recent().some((e) => e.level === 'error' && e.taskId === outcome.taskId)).toBe(
      true,
    );
  });

  it('fails when the browser is not running', async () => {
    agent = createTestAgent();
    const outcome = await agent.tasks.run('Open wikipedia.org');
    expect(outcome).toMatchObject({
      status: 'FAILED',
      errorMessage: expect.stringContaining('Agent Browser is not running') as string,
    });
  });

  it('records the failing action and a redacted error when a browser action throws', async () => {
    const { tasks, database, controller } = await readyAgent();
    controller.failOn = {
      method: 'type',
      error: new BrowserError(
        'TIMEOUT',
        'type timed out waiting for #searchInput at https://x.test/?token=secret',
        'type',
      ),
    };

    const outcome = await tasks.run(DEMO);

    expect(outcome.status).toBe('FAILED');
    expect(outcome.errorMessage).not.toContain('secret');
    const events = database.browserEvents.listByTask(outcome.taskId);
    expect(events.at(-1)).toMatchObject({
      eventType: 'ACTION_FAILED',
      details: { stepIndex: 1, actionType: 'fill' },
    });
    expect(controller.calls.map(([method]) => method)).not.toContain('press');
  });

  it('rejects a second task while one is running', async () => {
    const { tasks } = await readyAgent();
    const first = tasks.run('Open wikipedia.org');
    await expect(tasks.run('Open wikipedia.org')).rejects.toMatchObject({ code: 'TASK_REJECTED' });
    await expect(first).resolves.toMatchObject({ status: 'COMPLETED' });
  });

  it('cancels the running task at the next step when shutting down', async () => {
    const { tasks, database, controller } = await readyAgent();
    let releaseNavigation: () => void = () => undefined;
    controller.goto = (url) => {
      controller.calls.push(['goto', url]);
      return new Promise<void>((resolve) => {
        releaseNavigation = resolve;
      });
    };

    const running = tasks.run(DEMO);
    const stopping = tasks.stopAcceptingTasks('Atlas Agent is shutting down');
    releaseNavigation();
    await stopping;

    const outcome = await running;
    expect(outcome).toMatchObject({
      status: 'CANCELLED',
      errorMessage: 'Atlas Agent is shutting down',
    });
    expect(database.tasks.findById(outcome.taskId)?.status).toBe('CANCELLED');
    expect(controller.calls.map(([method]) => method)).not.toContain('type');
    await expect(tasks.run('Open wikipedia.org')).rejects.toMatchObject({ code: 'SHUTTING_DOWN' });
  });
});
