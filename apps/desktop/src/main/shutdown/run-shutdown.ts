import type { Logger } from '@atlas/logger';

export interface ShutdownStep {
  name: string;
  run: () => Promise<void> | void;
  /** Maximum time the step may take before shutdown moves on. */
  timeoutMs?: number;
}

export interface ShutdownStepReport {
  name: string;
  outcome: 'completed' | 'failed' | 'timed-out';
  durationMs: number;
}

const DEFAULT_STEP_TIMEOUT_MS = 10_000;

/**
 * Runs shutdown steps strictly in order. A failing or hanging step is logged
 * and does not prevent later steps (e.g. flushing logs) from running.
 */
export async function runShutdownSteps(
  steps: readonly ShutdownStep[],
  logger: Logger,
): Promise<ShutdownStepReport[]> {
  const reports: ShutdownStepReport[] = [];
  for (const step of steps) {
    const startedAt = Date.now();
    const outcome = await runWithTimeout(step, logger);
    reports.push({ name: step.name, outcome, durationMs: Date.now() - startedAt });
  }
  return reports;
}

async function runWithTimeout(
  step: ShutdownStep,
  logger: Logger,
): Promise<ShutdownStepReport['outcome']> {
  const timeoutMs = step.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timed-out'>((resolve) => {
    timer = setTimeout(() => resolve('timed-out'), timeoutMs);
  });
  try {
    const outcome = await Promise.race([
      Promise.resolve()
        .then(step.run)
        .then(() => 'completed' as const),
      timeout,
    ]);
    if (outcome === 'timed-out') {
      logger.warn(`Shutdown step "${step.name}" timed out`, { metadata: { timeoutMs } });
    } else {
      logger.debug(`Shutdown step "${step.name}" completed`);
    }
    return outcome;
  } catch (error) {
    logger.error(`Shutdown step "${step.name}" failed`, { metadata: { error } });
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}
