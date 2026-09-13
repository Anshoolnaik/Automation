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
  SearchPlanSummarySchema,
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

// Strategies and query generation
export { countryBroadStrategy } from './strategies/country-broad.strategy.js';
export { countryLevelStrategy } from './strategies/country-level.strategy.js';
export { DEFAULT_SEARCH_STRATEGIES } from './strategies/default-strategies.js';
export { institutionBroadStrategy } from './strategies/institution-broad.strategy.js';
export { institutionLevelStrategy } from './strategies/institution-level.strategy.js';
export { institutionKeywordVariantStrategy } from './strategies/keyword-variant.strategy.js';
export { PRIORITY_BASE, scorePriority, type PriorityKind } from './strategies/priority.js';
export { programSpecificStrategy } from './strategies/program-specific.strategy.js';
export type { SearchPlanningContext, SearchStrategy } from './strategies/search-strategy.js';
export {
  DEFAULT_PLANNING_LIMITS,
  PlanningLimitsSchema,
  resolvePlanningLimits,
  type PlanningLimits,
} from './query/planning-limits.js';
export {
  generateSearchQueries,
  type GeneratedQueries,
  type LimitDiscards,
  type PlanningStatistics,
} from './query/query-generator.js';
export {
  DEFAULT_MAX_VARIATIONS_PER_INSTITUTION,
  buildPlanningContext,
} from './planner/planning-context.js';

// Ports
export type {
  CampaignStatusChange,
  InstitutionStore,
  JobSelection,
  JobStatusChange,
  NewSearchCampaign,
  NewSearchJob,
  RunningJobUpdate,
  SearchCampaignStore,
  SearchJobStore,
  SearchProgressReader,
  SearchQueryStore,
  SearchSourceStore,
  SearchStores,
  SearchUnitOfWork,
  StatusCountRow,
} from './ports/search-stores.js';

// Planning services
export { resolveEnabledSources } from './planner/resolve-sources.js';
export {
  SearchPlanner,
  type SearchPlannerDependencies,
  type SearchPlanResult,
  type SearchPlanningInput,
} from './planner/search-planner.js';
export {
  MAX_CAMPAIGN_NAME_LENGTH,
  MAX_JOB_PAGE_SIZE,
  SearchCampaignService,
  type CreateSearchCampaignInput,
  type SearchCampaignServiceDependencies,
} from './campaigns/search-campaign-service.js';

// Job queue
export {
  DEFAULT_MAX_ATTEMPTS,
  SearchJobQueue,
  type JobFilter,
  type SearchJobQueueOptions,
} from './jobs/search-job-queue.js';

// Progress and composition
export {
  SearchProgressService,
  type CountryProgress,
  type InstitutionProgress,
  type ProgressCounts,
  type SearchProgress,
  type SourceProgress,
} from './progress/search-progress-service.js';
export {
  createSearchServices,
  type SearchServices,
  type SearchServicesOptions,
} from './services.js';
