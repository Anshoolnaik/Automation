import type { EducationLevel, EducationLevelDefinition } from '../domain/education-level.js';

/**
 * Controlled vocabulary for higher-education levels (Diploma and above).
 * `queryTerms` are deliberately short: every term multiplies the number of
 * institution-level queries. `vocabulary` is the wider recognition list.
 */
export const EDUCATION_LEVEL_DEFINITIONS: readonly EducationLevelDefinition[] = [
  {
    level: 'DIPLOMA',
    label: 'Diploma',
    rank: 10,
    queryTerms: ['diploma'],
    vocabulary: [
      'diploma',
      'national diploma',
      'ordinary national diploma',
      'OND',
      'college diploma',
    ],
  },
  {
    level: 'ADVANCED_DIPLOMA',
    label: 'Advanced Diploma',
    rank: 20,
    queryTerms: ['advanced diploma', 'HND'],
    vocabulary: ['advanced diploma', 'higher diploma', 'higher national diploma', 'HND'],
  },
  {
    level: 'ASSOCIATE',
    label: 'Associate Degree',
    rank: 20,
    queryTerms: ['associate degree'],
    vocabulary: [
      'associate degree',
      "associate's degree",
      'associate of arts',
      'associate of science',
      'associate of applied science',
    ],
  },
  {
    level: 'BACHELOR',
    label: "Bachelor's Degree",
    rank: 30,
    queryTerms: ['bachelor', 'BSc'],
    vocabulary: [
      'bachelor',
      "bachelor's",
      'bachelors',
      'undergraduate',
      'BSc',
      'BA',
      'BEng',
      'BCom',
      'LLB',
    ],
  },
  {
    level: 'POSTGRADUATE_DIPLOMA',
    label: 'Postgraduate Diploma',
    rank: 40,
    queryTerms: ['postgraduate diploma'],
    vocabulary: [
      'postgraduate diploma',
      'graduate diploma',
      'PGD',
      'PGDip',
      'postgraduate certificate',
      'PGCert',
    ],
  },
  {
    level: 'MASTER',
    label: "Master's Degree",
    rank: 50,
    queryTerms: ['master', 'MSc'],
    vocabulary: [
      'master',
      "master's",
      'masters',
      'MSc',
      'MA',
      'MBA',
      'MTech',
      'MEng',
      'MPhil',
      'LLM',
    ],
  },
  {
    level: 'DOCTORATE',
    label: 'Doctorate',
    rank: 60,
    queryTerms: ['PhD'],
    vocabulary: ['doctorate', 'doctoral', 'PhD', 'DPhil', 'EdD', 'DBA'],
  },
  {
    level: 'OTHER_HIGHER_EDUCATION',
    label: 'Other Higher Education',
    rank: 10,
    queryTerms: ['higher education'],
    vocabulary: [
      'higher education',
      'tertiary education',
      'post-secondary',
      'certificate of higher education',
    ],
  },
];

const byLevel = new Map(
  EDUCATION_LEVEL_DEFINITIONS.map((definition) => [definition.level, definition]),
);

export function getEducationLevelDefinition(level: EducationLevel): EducationLevelDefinition {
  const definition = byLevel.get(level);
  if (!definition) throw new Error(`No definition for education level ${level}`);
  return definition;
}

/** The levels at or above a minimum rank, e.g. the assignment's "Diploma and above". */
export function educationLevelsAtOrAbove(
  minimum: EducationLevel,
  definitions: readonly EducationLevelDefinition[] = EDUCATION_LEVEL_DEFINITIONS,
): EducationLevel[] {
  const minimumRank = getEducationLevelDefinition(minimum).rank;
  return definitions.filter((definition) => definition.rank >= minimumRank).map((d) => d.level);
}
