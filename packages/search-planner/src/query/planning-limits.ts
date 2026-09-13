import { z } from 'zod';

/** Hard caps that stop the country × institution × level × keyword product exploding. */
export interface PlanningLimits {
  maxQueriesPerCountry: number;
  maxQueriesPerInstitution: number;
  maxTotalQueries: number;
}

/** Development defaults: enough to exercise everything, small enough to inspect. */
export const DEFAULT_PLANNING_LIMITS: Readonly<PlanningLimits> = {
  maxQueriesPerCountry: 300,
  maxQueriesPerInstitution: 12,
  maxTotalQueries: 5_000,
};

export const PlanningLimitsSchema = z
  .object({
    maxQueriesPerCountry: z.number().int().min(1).max(1_000_000),
    maxQueriesPerInstitution: z.number().int().min(1).max(10_000),
    maxTotalQueries: z.number().int().min(1).max(10_000_000),
  })
  .strict();

export function resolvePlanningLimits(overrides: Partial<PlanningLimits> = {}): PlanningLimits {
  return PlanningLimitsSchema.parse({ ...DEFAULT_PLANNING_LIMITS, ...overrides });
}
