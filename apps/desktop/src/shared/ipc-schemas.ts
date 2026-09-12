import { z } from 'zod';

import { MAX_COMMAND_LENGTH } from './ipc-limits.js';

export const TaskRunRequestSchema = z
  .object({
    command: z
      .string()
      .trim()
      .min(1, 'Command must not be empty')
      .max(MAX_COMMAND_LENGTH, `Command must be at most ${MAX_COMMAND_LENGTH} characters`),
  })
  .strict();

export type TaskRunRequest = z.infer<typeof TaskRunRequestSchema>;

/** Channels that take no payload must receive none. */
export const EmptyRequestSchema = z.undefined();
