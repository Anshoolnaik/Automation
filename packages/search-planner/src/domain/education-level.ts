export const EDUCATION_LEVELS = [
  'DIPLOMA',
  'ADVANCED_DIPLOMA',
  'ASSOCIATE',
  'BACHELOR',
  'POSTGRADUATE_DIPLOMA',
  'MASTER',
  'DOCTORATE',
  'OTHER_HIGHER_EDUCATION',
] as const;

export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export interface EducationLevelDefinition {
  level: EducationLevel;
  label: string;
  /** Relative academic rank; used to select "level X and above". */
  rank: number;
  /** Short list of terms search strategies put into queries, most useful first. */
  queryTerms: readonly string[];
  /** Wider controlled vocabulary for recognising the level (e.g. by later classifiers). */
  vocabulary: readonly string[];
}

export function isEducationLevel(value: unknown): value is EducationLevel {
  return typeof value === 'string' && (EDUCATION_LEVELS as readonly string[]).includes(value);
}
