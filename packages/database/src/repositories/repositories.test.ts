import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openAtlasDatabase, type AtlasDatabase } from '../atlas-database.js';
import { IN_MEMORY } from '../sqlite/sqlite-database.js';
import { RecordStateError } from './types.js';

let db: AtlasDatabase;
let clock: Date;

beforeEach(() => {
  clock = new Date('2026-09-13T12:00:00.000Z');
  let nextId = 0;
  db = openAtlasDatabase({
    filePath: IN_MEMORY,
    now: () => clock,
    generateId: () => `id-${++nextId}`,
  });
});

afterEach(() => {
  db.close();
});

const tick = (ms = 1_000) => {
  clock = new Date(clock.getTime() + ms);
};

describe('AgentRunRepository', () => {
  it('starts and stops a run', () => {
    const run = db.agentRuns.start();
    expect(run).toEqual({
      id: 'id-1',
      startedAt: '2026-09-13T12:00:00.000Z',
      endedAt: null,
      status: 'RUNNING',
    });
    tick();
    db.agentRuns.stop(run.id);
    expect(db.agentRuns.findById(run.id)).toMatchObject({
      status: 'STOPPED',
      endedAt: '2026-09-13T12:00:01.000Z',
    });
    expect(() => db.agentRuns.stop(run.id)).toThrow(RecordStateError);
  });

  it('marks runs left over from a crash as ABORTED', () => {
    const crashed = db.agentRuns.start();
    expect(db.agentRuns.abortUnfinished()).toBe(1);
    expect(db.agentRuns.findById(crashed.id)?.status).toBe('ABORTED');
  });
});

describe('TaskRepository', () => {
  it('persists the full task lifecycle PENDING -> RUNNING -> COMPLETED', () => {
    const run = db.agentRuns.start();
    const task = db.tasks.create({ command: 'Open wikipedia.org', agentRunId: run.id });
    expect(task).toEqual({
      id: 'id-2',
      agentRunId: run.id,
      command: 'Open wikipedia.org',
      status: 'PENDING',
      createdAt: '2026-09-13T12:00:00.000Z',
      startedAt: null,
      completedAt: null,
      errorMessage: null,
    });

    tick();
    expect(db.tasks.markRunning(task.id)).toMatchObject({
      status: 'RUNNING',
      startedAt: '2026-09-13T12:00:01.000Z',
    });
    tick();
    expect(db.tasks.markCompleted(task.id)).toMatchObject({
      status: 'COMPLETED',
      completedAt: '2026-09-13T12:00:02.000Z',
      errorMessage: null,
    });
  });

  it('records failures and cancellations with a message', () => {
    const failed = db.tasks.create({ command: 'Open nowhere.invalid' });
    db.tasks.markRunning(failed.id);
    expect(db.tasks.markFailed(failed.id, 'Navigation failed')).toMatchObject({
      status: 'FAILED',
      errorMessage: 'Navigation failed',
    });

    const cancelled = db.tasks.create({ command: 'Open example.com' });
    expect(db.tasks.markCancelled(cancelled.id, 'Atlas is shutting down')).toMatchObject({
      status: 'CANCELLED',
      errorMessage: 'Atlas is shutting down',
    });
  });

  it('guards status transitions in the database', () => {
    const task = db.tasks.create({ command: 'Open a.com' });
    expect(() => db.tasks.markCompleted(task.id)).toThrow('cannot move from PENDING to COMPLETED');
    db.tasks.markRunning(task.id);
    db.tasks.markCompleted(task.id);
    expect(() => db.tasks.markFailed(task.id, 'late')).toThrow(RecordStateError);
    expect(() => db.tasks.markRunning('missing')).toThrow('does not exist');
  });

  it('fails tasks interrupted by a crash', () => {
    const pending = db.tasks.create({ command: 'a' });
    const running = db.tasks.create({ command: 'b' });
    db.tasks.markRunning(running.id);
    const done = db.tasks.create({ command: 'c' });
    db.tasks.markRunning(done.id);
    db.tasks.markCompleted(done.id);

    expect(db.tasks.failInterrupted('Interrupted')).toBe(2);
    expect(db.tasks.findById(pending.id)?.status).toBe('FAILED');
    expect(db.tasks.findById(running.id)?.errorMessage).toBe('Interrupted');
    expect(db.tasks.findById(done.id)?.status).toBe('COMPLETED');
  });

  it('lists recent tasks newest first with a bounded limit', () => {
    db.tasks.create({ command: 'first' });
    tick();
    db.tasks.create({ command: 'second' });
    expect(db.tasks.listRecent(10).map((t) => t.command)).toEqual(['second', 'first']);
    expect(db.tasks.listRecent(0)).toHaveLength(1);
  });

  it('rejects statuses outside the allowed set at the schema level', () => {
    const task = db.tasks.create({ command: 'x' });
    expect(() =>
      (db.tasks as unknown as { transition: (...args: unknown[]) => unknown }).transition(
        task.id,
        ['PENDING'],
        'EXPLODED',
        'started_at = :now',
      ),
    ).toThrow(/CHECK constraint failed/);
  });
});

describe('BrowserEventRepository', () => {
  it('stores task and session events with JSON details', () => {
    const task = db.tasks.create({ command: 'Open wikipedia.org' });
    db.browserEvents.create({ eventType: 'BROWSER_LAUNCHED' });
    tick();
    db.browserEvents.create({
      taskId: task.id,
      eventType: 'ACTION_COMPLETED',
      url: 'https://www.wikipedia.org/',
      details: { action: 'navigate', durationMs: 812 },
    });

    expect(db.browserEvents.listByTask(task.id)).toEqual([
      {
        id: 'id-3',
        taskId: task.id,
        eventType: 'ACTION_COMPLETED',
        url: 'https://www.wikipedia.org/',
        details: { action: 'navigate', durationMs: 812 },
        createdAt: '2026-09-13T12:00:01.000Z',
      },
    ]);
    expect(db.browserEvents.listRecent(10).map((e) => e.eventType)).toEqual([
      'ACTION_COMPLETED',
      'BROWSER_LAUNCHED',
    ]);
    expect(db.browserEvents.listRecent(10)[1]).toMatchObject({
      taskId: null,
      url: null,
      details: {},
    });
  });

  it('enforces the task foreign key', () => {
    expect(() => db.browserEvents.create({ taskId: 'nope', eventType: 'X' })).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });
});

describe('CheckpointRepository', () => {
  it('stores arbitrary JSON checkpoint data per task', () => {
    const task = db.tasks.create({ command: 'Open wikipedia.org and search for Alan Turing' });
    db.checkpoints.create({
      taskId: task.id,
      checkpointType: 'ACTION_COMPLETED',
      data: { step: 1, of: 3, url: 'https://www.wikipedia.org/' },
    });
    db.checkpoints.create({ taskId: task.id, checkpointType: 'TASK_RESULT', data: ['ok', null] });

    expect(db.checkpoints.listByTask(task.id).map((c) => [c.checkpointType, c.data])).toEqual([
      ['ACTION_COMPLETED', { step: 1, of: 3, url: 'https://www.wikipedia.org/' }],
      ['TASK_RESULT', ['ok', null]],
    ]);
  });
});
