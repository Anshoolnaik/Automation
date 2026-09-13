import { z } from 'zod';

import { normalizeText } from '../query/normalize-query.js';
import type { CountryDefinition } from './country.js';
import {
  EDUCATION_LEVELS,
  type EducationLevel,
  type EducationLevelDefinition,
} from './education-level.js';
import { SearchError } from './errors.js';
import type { TranscriptKeyword } from './transcript-keyword.js';

/** What a campaign wants to find, in canonical (sorted, de-duplicated) form. */
export interface SearchIntent {
  countries: string[];
  educationLevels: EducationLevel[];
  includeInstitutions: boolean;
  /** Transcript keyword IDs. */
  keywords: string[];
  programNames?: string[];
  maxVariationsPerInstitution?: number;
}

/** The controlled vocabulary an intent is validated against. */
export interface SearchVocabulary {
  countries: readonly CountryDefinition[];
  educationLevels: readonly EducationLevelDefinition[];
  keywords: readonly TranscriptKeyword[];
}

export const MAX_PROGRAM_NAMES = 25;
export const MAX_VARIATIONS_PER_INSTITUTION = 50;

const programNameSchema = z.string().trim().min(2).max(120);

/** Structure only; used when reading intents back from storage. */
export const SearchIntentShapeSchema = z
  .object({
    countries: z.array(z.string()),
    educationLevels: z.array(z.enum(EDUCATION_LEVELS)),
    includeInstitutions: z.boolean(),
    keywords: z.array(z.string()),
    programNames: z.array(z.string()).optional(),
    maxVariationsPerInstitution: z.number().int().optional(),
  })
  .strict();

/**
 * Full validation against a vocabulary. Rejects unknown countries, keywords and
 * levels, empty lists and unknown fields, then canonicalizes the order so that
 * equivalent intents are identical.
 */
export function createSearchIntentSchema(vocabulary: SearchVocabulary) {
  const countryOrder = indexBy(vocabulary.countries.map((country) => country.code));
  const levelOrder = indexBy(vocabulary.educationLevels.map((definition) => definition.level));
  const keywordOrder = indexBy(vocabulary.keywords.map((keyword) => keyword.id));

  return z
    .object({
      countries: z
        .array(
          z
            .string()
            .trim()
            .transform((code) => code.toUpperCase())
            .refine((code) => countryOrder.has(code), {
              error: (issue) => `Unknown country code: ${String(issue.input)}`,
            }),
        )
        .min(1, 'Select at least one country'),
      educationLevels: z
        .array(
          z.enum(EDUCATION_LEVELS).refine((level) => levelOrder.has(level), {
            error: (issue) => `Education level not enabled: ${String(issue.input)}`,
          }),
        )
        .min(1, 'Select at least one education level'),
      includeInstitutions: z.boolean().default(true),
      keywords: z
        .array(
          z.string().refine((id) => keywordOrder.has(id), {
            error: (issue) => `Unknown transcript keyword: ${String(issue.input)}`,
          }),
        )
        .min(1, 'Select at least one transcript keyword'),
      programNames: z.array(programNameSchema).max(MAX_PROGRAM_NAMES).optional(),
      maxVariationsPerInstitution: z
        .number()
        .int()
        .min(1)
        .max(MAX_VARIATIONS_PER_INSTITUTION)
        .optional(),
    })
    .strict()
    .transform((input): SearchIntent => {
      const intent: SearchIntent = {
        countries: sortByIndex(unique(input.countries), countryOrder),
        educationLevels: sortByIndex(unique(input.educationLevels), levelOrder),
        includeInstitutions: input.includeInstitutions,
        keywords: sortByIndex(unique(input.keywords), keywordOrder),
      };
      const programs = canonicalPrograms(input.programNames ?? []);
      if (programs.length > 0) intent.programNames = programs;
      if (input.maxVariationsPerInstitution !== undefined) {
        intent.maxVariationsPerInstitution = input.maxVariationsPerInstitution;
      }
      return intent;
    });
}

export type SearchIntentInput = z.input<ReturnType<typeof createSearchIntentSchema>>;

export function parseSearchIntent(input: unknown, vocabulary: SearchVocabulary): SearchIntent {
  const result = createSearchIntentSchema(vocabulary).safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) =>
        issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
      )
      .join('; ');
    throw new SearchError('SEARCH_INTENT_INVALID', `Invalid search intent: ${details}`);
  }
  return result.data;
}

function canonicalPrograms(programs: readonly string[]): string[] {
  const byKey = new Map<string, string>();
  for (const program of programs) {
    const key = normalizeText(program);
    if (key && !byKey.has(key)) byKey.set(key, program.replace(/\s+/g, ' ').trim());
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, name]) => name);
}

function indexBy(values: readonly string[]): Map<string, number> {
  return new Map(values.map((value, index) => [value, index]));
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function sortByIndex<T extends string>(values: T[], order: Map<string, number>): T[] {
  return values.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}
