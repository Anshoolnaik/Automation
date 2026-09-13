import { createHash } from 'node:crypto';

import { z } from 'zod';

import { normalizeText } from '../query/normalize-query.js';

export const INSTITUTION_TYPES = [
  'UNIVERSITY',
  'COLLEGE',
  'POLYTECHNIC',
  'INSTITUTE',
  'OTHER',
] as const;

export type InstitutionType = (typeof INSTITUTION_TYPES)[number];

export interface Institution {
  id: string;
  countryCode: string;
  name: string;
  aliases: readonly string[];
  type: InstitutionType;
  /** Where the record came from, e.g. `static-fixture`. */
  source: string;
}

export const InstitutionSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    countryCode: z.string().regex(/^[A-Z0-9]{2,8}$/),
    name: z.string().trim().min(2).max(300),
    aliases: z.array(z.string().trim().min(1).max(300)).max(50),
    type: z.enum(INSTITUTION_TYPES),
    source: z.string().trim().min(1).max(100),
  })
  .strict();

/**
 * Deterministic institution ID from country and name, e.g. `ca-university-of-toronto`.
 * Names that do not reduce to ASCII fall back to a short hash.
 */
export function createInstitutionId(countryCode: string, name: string): string {
  const normalized = normalizeText(name);
  const slug = normalized
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/ +/g, '-')
    .slice(0, 80);
  const suffix = slug || createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  return `${countryCode.toLowerCase()}-${suffix}`;
}
