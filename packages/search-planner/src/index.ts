// Domain
export type { CountryCodeType, CountryDefinition } from './domain/country.js';
export {
  EDUCATION_LEVELS,
  isEducationLevel,
  type EducationLevel,
  type EducationLevelDefinition,
} from './domain/education-level.js';
export { SearchError, type SearchErrorCode } from './domain/errors.js';
export {
  INSTITUTION_TYPES,
  InstitutionSchema,
  createInstitutionId,
  type Institution,
  type InstitutionType,
} from './domain/institution.js';
export {
  SEARCH_CAMPAIGN_STATUSES,
  SEARCH_CAMPAIGN_TRANSITIONS,
  canTransitionCampaign,
  type SearchCampaign,
  type SearchCampaignStatus,
  type SearchPlanSummary,
} from './domain/search-campaign.js';
export {
  MAX_PROGRAM_NAMES,
  MAX_VARIATIONS_PER_INSTITUTION,
  SearchIntentShapeSchema,
  createSearchIntentSchema,
  parseSearchIntent,
  type SearchIntent,
  type SearchIntentInput,
  type SearchVocabulary,
} from './domain/search-intent.js';
export {
  SEARCH_JOB_STATUSES,
  SEARCH_JOB_TRANSITIONS,
  canTransitionJob,
  jobStatusesThatCanBecome,
  type SearchJob,
  type SearchJobStatus,
  type SearchJobView,
} from './domain/search-job.js';
export {
  SEARCH_STRATEGY_IDS,
  type SearchQuery,
  type SearchQueryCandidate,
  type SearchStrategyId,
} from './domain/search-query.js';
export type { SearchSource } from './domain/search-source.js';
export type { TranscriptKeyword } from './domain/transcript-keyword.js';
export {
  canTransition,
  isTerminalStatus,
  sourcesOf,
  type TransitionTable,
} from './domain/transitions.js';

// Query identity
export {
  createJobId,
  createQueryId,
  normalizeText,
  queryIdentity,
  sha256Hex,
  type QueryIdentity,
} from './query/normalize-query.js';

// Configuration (academic transcript collection)
export { ASSIGNMENT_COUNTRIES, findCountry, resolveCountry } from './config/countries.js';
export {
  EDUCATION_LEVEL_DEFINITIONS,
  educationLevelsAtOrAbove,
  getEducationLevelDefinition,
} from './config/education-levels.js';
export { ALL_TRANSCRIPT_KEYWORD_IDS, TRANSCRIPT_KEYWORDS } from './config/transcript-keywords.js';
export {
  ASSIGNMENT_EDUCATION_LEVELS,
  SCRIBD_SOURCE_ID,
  TRANSCRIPT_SEARCH_VOCABULARY,
} from './config/vocabulary.js';

// Institutions
export {
  INSTITUTION_FIXTURES,
  STATIC_FIXTURE_SOURCE,
} from './institutions/fixtures/institution-fixtures.js';
export type { InstitutionProvider } from './institutions/institution-provider.js';
export { StaticInstitutionProvider } from './institutions/static-institution-provider.js';
