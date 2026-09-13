import {
  MAX_CAMPAIGN_NAME_LENGTH,
  MAX_JOB_PAGE_SIZE,
  MAX_PROGRAM_NAMES,
} from '@atlas/search-planner';
import { z } from 'zod';

import { EDUCATION_LEVEL_VALUES } from '../../shared/search-vocabulary.js';

/**
 * Shape validation for search requests from the renderer. Deeper domain checks
 * (known countries, keywords, enabled sources) happen in @atlas/search-planner.
 */

const identifier = z.string().trim().min(1).max(128);

export const CreateSearchCampaignRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Campaign name is required').max(MAX_CAMPAIGN_NAME_LENGTH),
    countries: z
      .array(
        z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9]{2,8}$/, 'Countries must be country codes'),
      )
      .min(1, 'Select at least one country')
      .max(100),
    educationLevels: z
      .array(z.enum(EDUCATION_LEVEL_VALUES))
      .min(1, 'Select at least one education level')
      .max(20),
    keywords: z
      .array(z.string().regex(/^[a-z]+(-[a-z]+)*$/, 'Keywords must be keyword IDs'))
      .min(1)
      .max(50)
      .optional(),
    includeInstitutions: z.boolean().optional(),
    programNames: z.array(z.string().trim().min(2).max(120)).max(MAX_PROGRAM_NAMES).optional(),
    sourceIds: z.array(identifier).min(1, 'Select at least one source').max(20),
  })
  .strict();

export const CampaignIdRequestSchema = z.object({ campaignId: identifier }).strict();

export const ListSearchJobsRequestSchema = z
  .object({
    campaignId: identifier,
    limit: z.number().int().min(1).max(MAX_JOB_PAGE_SIZE).default(50),
    offset: z.number().int().min(0).max(10_000_000).default(0),
  })
  .strict();
