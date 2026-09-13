import { TRANSCRIPT_SEARCH_VOCABULARY } from '../config/vocabulary.js';
import { createInstitutionId, type Institution } from '../domain/institution.js';
import { parseSearchIntent, type SearchIntentInput } from '../domain/search-intent.js';
import { INSTITUTION_FIXTURES } from '../institutions/fixtures/institution-fixtures.js';
import { buildPlanningContext } from '../planner/planning-context.js';
import type { SearchPlanningContext } from '../strategies/search-strategy.js';

export const TEST_CAMPAIGN_ID = 'campaign-test';

export const TEST_INTENT: SearchIntentInput = {
  countries: ['CA', 'GB'],
  educationLevels: ['DIPLOMA', 'BACHELOR', 'MASTER'],
  includeInstitutions: true,
  keywords: ['transcript', 'academic-record', 'statement-of-results'],
};

/** Builds a validated planning context from intent overrides and institutions. */
export function createTestContext(
  intent: Partial<SearchIntentInput> = {},
  institutions: readonly Institution[] = INSTITUTION_FIXTURES,
): SearchPlanningContext {
  return buildPlanningContext({
    campaignId: TEST_CAMPAIGN_ID,
    intent: parseSearchIntent({ ...TEST_INTENT, ...intent }, TRANSCRIPT_SEARCH_VOCABULARY),
    vocabulary: TRANSCRIPT_SEARCH_VOCABULARY,
    institutions,
  });
}

/** A synthetic country with many institutions, for scale tests. */
export function syntheticInstitutions(countryCode: string, count: number): Institution[] {
  return Array.from({ length: count }, (_, index) => {
    const name = `Synthetic University Number ${index + 1}`;
    return {
      id: createInstitutionId(countryCode, name),
      countryCode,
      name,
      aliases: [],
      type: 'UNIVERSITY',
      source: 'synthetic',
    };
  });
}
