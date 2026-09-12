import { initialSchema } from './0001-initial-schema.js';
import type { Migration } from './migration.js';

/** Every schema change, in order. Append new migrations; never edit released ones. */
export const MIGRATIONS: readonly Migration[] = [initialSchema];

export type { Migration } from './migration.js';
