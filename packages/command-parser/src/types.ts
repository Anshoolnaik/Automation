import type { BrowserAction } from '@atlas/browser-core';

/** One executable step plus the human-readable line shown in the activity log. */
export interface PlannedStep {
  description: string;
  action: BrowserAction;
}

export interface TaskPlan {
  summary: string;
  steps: PlannedStep[];
}

export type ParseResult = { ok: true; plan: TaskPlan } | { ok: false; error: string };

/**
 * Turns a natural-language command into a plan of browser actions.
 * Phase 1 ships a deterministic implementation; a future AI planner can
 * implement the same interface.
 */
export interface CommandParser {
  parse(command: string): ParseResult;
}
