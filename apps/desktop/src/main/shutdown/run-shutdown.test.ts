import { createNoopLogger } from '@atlas/logger';
import { describe, expect, it } from 'vitest';

import { runShutdownSteps } from './run-shutdown.js';

describe('runShutdownSteps', () => {
  it('runs steps in order and continues past failures and timeouts', async () => {
    const order: string[] = [];
    const reports = await runShutdownSteps(
      [
        { name: 'stop-tasks', run: () => void order.push('stop-tasks') },
        {
          name: 'close-server',
          run: () => {
            order.push('close-server');
            throw new Error('already closed');
          },
        },
        {
          name: 'close-browser',
          timeoutMs: 20,
          run: () => {
            order.push('close-browser');
            return new Promise<void>(() => undefined);
          },
        },
        {
          name: 'flush-logs',
          run: async () => {
            await Promise.resolve();
            order.push('flush-logs');
          },
        },
      ],
      createNoopLogger(),
    );

    expect(order).toEqual(['stop-tasks', 'close-server', 'close-browser', 'flush-logs']);
    expect(reports.map((r) => [r.name, r.outcome])).toEqual([
      ['stop-tasks', 'completed'],
      ['close-server', 'failed'],
      ['close-browser', 'timed-out'],
      ['flush-logs', 'completed'],
    ]);
  });
});
