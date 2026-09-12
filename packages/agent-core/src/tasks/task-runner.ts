import type { TaskStatus } from '@atlas/agent-protocol';
import {
  executeBrowserAction,
  type BrowserAction,
  type BrowserController,
} from '@atlas/browser-core';
import type { CommandParser, PlannedStep } from '@atlas/command-parser';
import { sanitizeErrorMessage, type Logger } from '@atlas/logger';

import type { CurrentTask } from '../agent-status.js';
import { AgentError } from '../errors.js';
import type { BrowserEventRecorder } from '../ports.js';
import { createTaskStateMachine } from '../state/transitions.js';
import type { CheckpointStore, TaskStore } from './task-ports.js';

export interface TaskOutcome {
  taskId: string;
  status: TaskStatus;
  errorMessage?: string;
  finalUrl?: string;
  finalTitle?: string;
}

export interface TaskRunnerDependencies {
  tasks: TaskStore;
  checkpoints: CheckpointStore;
  events: BrowserEventRecorder;
  parser: CommandParser;
  /** Returns the running browser or throws AgentError(BROWSER_NOT_RUNNING). */
  getBrowser: () => BrowserController;
  logger: Logger;
  agentRunId?: string;
}

interface ActiveTask {
  id: string;
  command: string;
  machine: ReturnType<typeof createTaskStateMachine>;
  cancelReason: string | undefined;
  /** Settles when execution has finished (set right after the task starts). */
  done?: Promise<TaskOutcome>;
}

/**
 * Executes one command at a time:
 * create (PENDING, persisted) -> RUNNING -> parse -> execute actions
 * (each logged, recorded and checkpointed) -> COMPLETED | FAILED | CANCELLED.
 */
export class TaskRunner {
  private active: ActiveTask | undefined;
  private accepting = true;
  private readonly listeners = new Set<(task: CurrentTask) => void>();

  constructor(private readonly deps: TaskRunnerDependencies) {}

  get currentTask(): CurrentTask | undefined {
    const task = this.active;
    return task ? { id: task.id, command: task.command, status: task.machine.state } : undefined;
  }

  /** Notified on every task status change, including the final one. */
  onTaskUpdate(listener: (task: CurrentTask) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  run(command: string): Promise<TaskOutcome> {
    if (!this.accepting) {
      return Promise.reject(new AgentError('SHUTTING_DOWN', 'Atlas Agent is shutting down'));
    }
    if (this.active) {
      return Promise.reject(
        new AgentError('TASK_REJECTED', 'Another task is already running. Wait for it to finish.'),
      );
    }

    const trimmed = command.trim();
    const record = this.deps.tasks.create({
      command: trimmed,
      agentRunId: this.deps.agentRunId ?? null,
    });
    const active: ActiveTask = {
      id: record.id,
      command: trimmed,
      machine: createTaskStateMachine(),
      cancelReason: undefined,
    };
    this.active = active;
    active.machine.onChange(() => this.notify(active));
    this.deps.logger.info(`Task received: ${trimmed}`, { taskId: active.id });
    this.notify(active);

    const done = this.execute(active).finally(() => {
      if (this.active === active) this.active = undefined;
    });
    active.done = done;
    return done;
  }

  /**
   * Stops accepting tasks and cancels the running one at its next step boundary.
   * Resolves once no task is running.
   */
  async stopAcceptingTasks(reason = 'Atlas Agent is shutting down'): Promise<void> {
    this.accepting = false;
    const active = this.active;
    if (!active) return;
    active.cancelReason = reason;
    this.deps.logger.warn('Cancelling the running task', { taskId: active.id });
    await active.done?.catch(() => undefined);
  }

  private async execute(task: ActiveTask): Promise<TaskOutcome> {
    const { logger, tasks, events, checkpoints } = this.deps;
    const taskId = task.id;
    let currentStep: { index: number; step: PlannedStep } | undefined;

    try {
      tasks.markRunning(taskId);
      task.machine.transition('RUNNING');

      const parsed = this.deps.parser.parse(task.command);
      if (!parsed.ok) throw new AgentError('COMMAND_NOT_UNDERSTOOD', parsed.error);
      const browser = this.deps.getBrowser();
      const { steps } = parsed.plan;

      for (const [index, step] of steps.entries()) {
        this.throwIfCancelled(task);
        currentStep = { index, step };
        logger.info(step.description, { taskId });
        const details = {
          stepIndex: index,
          stepCount: steps.length,
          ...describeForStorage(step.action),
        };
        events.record({ type: 'ACTION_STARTED', taskId, details });

        const startedAt = Date.now();
        await executeBrowserAction(browser, step.action);
        const url = await browser.getCurrentUrl();
        const durationMs = Date.now() - startedAt;

        events.record({
          type: 'ACTION_COMPLETED',
          taskId,
          url,
          details: { ...details, durationMs },
        });
        checkpoints.create({
          taskId,
          checkpointType: 'STEP_COMPLETED',
          data: { ...details, url, durationMs },
        });
        currentStep = undefined;
      }

      const [finalTitle, finalUrl] = await Promise.all([
        browser.getPageTitle(),
        browser.getCurrentUrl(),
      ]);
      checkpoints.create({ taskId, checkpointType: 'TASK_RESULT', data: { finalUrl, finalTitle } });
      tasks.markCompleted(taskId);
      task.machine.transition('COMPLETED');
      logger.info(finalTitle ? `Task completed: ${finalTitle}` : 'Task completed', {
        taskId,
        metadata: { finalUrl, stepCount: steps.length },
      });
      return { taskId, status: 'COMPLETED', finalUrl, finalTitle };
    } catch (error) {
      const errorMessage = sanitizeErrorMessage(error);
      if (currentStep) {
        events.record({
          type: 'ACTION_FAILED',
          taskId,
          details: {
            stepIndex: currentStep.index,
            ...describeForStorage(currentStep.step.action),
            error: errorMessage,
          },
        });
      }

      if (error instanceof AgentError && error.code === 'TASK_CANCELLED') {
        tasks.markCancelled(taskId, errorMessage);
        task.machine.transition('CANCELLED');
        logger.warn(`Task cancelled: ${errorMessage}`, { taskId });
        return { taskId, status: 'CANCELLED', errorMessage };
      }

      tasks.markFailed(taskId, errorMessage);
      task.machine.transition('FAILED');
      logger.error(`Task failed: ${errorMessage}`, {
        taskId,
        metadata: { code: readCode(error), step: currentStep?.step.description },
      });
      return { taskId, status: 'FAILED', errorMessage };
    }
  }

  private throwIfCancelled(task: ActiveTask): void {
    if (task.cancelReason !== undefined) {
      throw new AgentError('TASK_CANCELLED', task.cancelReason);
    }
  }

  private notify(task: ActiveTask): void {
    const snapshot: CurrentTask = {
      id: task.id,
      command: task.command,
      status: task.machine.state,
    };
    for (const listener of this.listeners) listener(snapshot);
  }
}

/** Action details safe to persist: typed values (which may be sensitive) are omitted. */
function describeForStorage(action: BrowserAction): Record<string, unknown> {
  switch (action.type) {
    case 'navigate':
      return { actionType: action.type, url: action.url };
    case 'click':
      return { actionType: action.type, selector: action.selector };
    case 'fill':
      return {
        actionType: action.type,
        selector: action.selector,
        valueLength: action.value.length,
      };
    case 'press':
      return { actionType: action.type, selector: action.selector, key: action.key };
    case 'scroll':
      return { actionType: action.type, direction: action.direction, amount: action.amount };
  }
}

function readCode(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}
