import {
  ALL_TRANSCRIPT_KEYWORD_IDS,
  findCountry,
  type ProgressCounts,
  getEducationLevelDefinition,
  type SearchCampaign,
  type SearchPlanSummary,
  type SearchServices,
  type SearchSourceStore,
} from '@atlas/search-planner';

import type {
  CreateSearchCampaignRequest,
  NamedCodeDto,
  SearchCampaignDto,
  SearchJobDto,
  SearchPlanSummaryDto,
  SearchProgressDto,
} from '../../shared/ipc-types.js';

/** What the Electron shell needs for search campaigns. Maps domain objects to renderer DTOs. */
export interface SearchFacade {
  createCampaign(request: CreateSearchCampaignRequest): SearchCampaignDto;
  planCampaign(campaignId: string): Promise<SearchCampaignDto>;
  listCampaigns(): SearchCampaignDto[];
  getCampaign(campaignId: string): SearchCampaignDto;
  getProgress(campaignId: string): SearchProgressDto;
  listJobs(campaignId: string, page: { limit: number; offset: number }): SearchJobDto[];
}

const MAX_INSTITUTION_ROWS = 100;

export function createSearchFacade(
  services: Pick<SearchServices, 'campaigns' | 'progress'>,
  sources: SearchSourceStore,
): SearchFacade {
  const toDto = (campaign: SearchCampaign) => toCampaignDto(campaign, sources);

  return {
    createCampaign: (request) =>
      toDto(
        services.campaigns.createCampaign({
          name: request.name,
          intent: {
            countries: request.countries,
            educationLevels: request.educationLevels,
            keywords: request.keywords ?? [...ALL_TRANSCRIPT_KEYWORD_IDS],
            includeInstitutions: request.includeInstitutions ?? true,
            ...(request.programNames && { programNames: request.programNames }),
          },
          sourceIds: request.sourceIds,
        }),
      ),
    planCampaign: async (campaignId) => {
      await services.campaigns.planCampaign(campaignId);
      return toDto(services.campaigns.getCampaign(campaignId));
    },
    listCampaigns: () => services.campaigns.listCampaigns().map(toDto),
    getCampaign: (campaignId) => toDto(services.campaigns.getCampaign(campaignId)),
    getProgress: (campaignId) => {
      services.campaigns.getCampaign(campaignId);
      const progress = services.progress.getProgress(campaignId);
      const counts = ({ total, completed, failed, remaining }: ProgressCounts) => ({
        total,
        completed,
        failed,
        remaining,
      });
      return {
        campaignId,
        totalJobs: progress.totalJobs,
        pendingJobs: progress.pendingJobs,
        runningJobs: progress.runningJobs,
        pausedJobs: progress.pausedJobs,
        completedJobs: progress.completedJobs,
        failedJobs: progress.failedJobs,
        skippedJobs: progress.skippedJobs,
        completedPercent: progress.completedPercent,
        byCountry: progress.byCountry.map((row) => ({
          code: row.countryCode,
          name: row.countryName,
          ...counts(row),
        })),
        bySource: progress.bySource.map((row) => ({
          code: row.sourceId,
          name: row.sourceName,
          ...counts(row),
        })),
        byInstitution: progress.byInstitution
          .slice(0, MAX_INSTITUTION_ROWS)
          .map((row) => ({ code: row.institutionId, name: row.institutionName, ...counts(row) })),
      };
    },
    listJobs: (campaignId, page) =>
      services.campaigns.listJobs(campaignId, page).map((job) => ({
        id: job.id,
        priority: job.priority,
        queryText: job.queryText,
        countryCode: job.countryCode,
        countryName: countryName(job.countryCode),
        institutionName: job.institutionName,
        educationLevel: job.educationLevel,
        sourceName: job.sourceName,
        status: job.status,
        attemptCount: job.attemptCount,
        currentPage: job.currentPage,
        discoveredCount: job.discoveredCount,
        createdAt: job.createdAt,
      })),
  };
}

export function toCampaignDto(
  campaign: SearchCampaign,
  sources: SearchSourceStore,
): SearchCampaignDto {
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    countries: campaign.countries.map((code) => ({ code, name: countryName(code) })),
    educationLevels: campaign.educationLevels.map((level) => ({
      code: level,
      name: getEducationLevelDefinition(level).label,
    })),
    keywordCount: campaign.transcriptKeywords.length,
    includeInstitutions: campaign.intent.includeInstitutions,
    sources: campaign.sourceIds.map((id): NamedCodeDto => ({
      code: id,
      name: sources.findSource(id)?.name ?? id,
    })),
    createdAt: campaign.createdAt,
    plannedAt: campaign.plannedAt,
    lastError: campaign.lastError,
    planSummary: campaign.planSummary ? toSummaryDto(campaign.planSummary) : null,
  };
}

function toSummaryDto(summary: SearchPlanSummary): SearchPlanSummaryDto {
  return {
    plannedAt: summary.plannedAt,
    countryCount: summary.countryCount,
    institutionCount: summary.institutionCount,
    queryCount: summary.queryCount,
    jobCount: summary.jobCount,
    duplicatesRemoved: summary.duplicatesRemoved,
    newQueryCount: summary.newQueryCount,
    newJobCount: summary.newJobCount,
    discardedByLimit: summary.discardedByLimit,
    jobsByCountry: Object.entries(summary.jobsByCountry).map(([code, jobs]) => ({
      code,
      name: countryName(code),
      jobs,
    })),
  };
}

function countryName(code: string): string {
  return findCountry(code)?.name ?? code;
}
