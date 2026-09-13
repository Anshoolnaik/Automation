import { EDUCATION_LEVELS } from '../domain/education-level.js';
import type { SearchVocabulary } from '../domain/search-intent.js';
import { ASSIGNMENT_COUNTRIES } from './countries.js';
import { EDUCATION_LEVEL_DEFINITIONS } from './education-levels.js';
import { TRANSCRIPT_KEYWORDS } from './transcript-keywords.js';

/** The vocabulary for the academic transcript collection assignment. */
export const TRANSCRIPT_SEARCH_VOCABULARY: SearchVocabulary = {
  countries: ASSIGNMENT_COUNTRIES,
  educationLevels: EDUCATION_LEVEL_DEFINITIONS,
  keywords: TRANSCRIPT_KEYWORDS,
};

/** The assignment asks for Diploma level and above: every configured level. */
export const ASSIGNMENT_EDUCATION_LEVELS = [...EDUCATION_LEVELS];

/** ID of the pre-configured Scribd source (seeded by migration; not automated in Phase 2). */
export const SCRIBD_SOURCE_ID = 'scribd';
