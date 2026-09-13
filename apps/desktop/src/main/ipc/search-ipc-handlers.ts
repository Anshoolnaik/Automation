import { IpcChannel } from '../../shared/ipc-channels.js';
import { EmptyRequestSchema } from '../../shared/ipc-schemas.js';
import type { SearchFacade } from '../search/search-facade.js';
import type { IpcHandler, RequestHandlerFactory } from './request-handler.js';
import {
  CampaignIdRequestSchema,
  CreateSearchCampaignRequestSchema,
  ListSearchJobsRequestSchema,
} from './search-ipc-schemas.js';

type SearchChannel =
  | typeof IpcChannel.SearchCreateCampaign
  | typeof IpcChannel.SearchPlanCampaign
  | typeof IpcChannel.SearchListCampaigns
  | typeof IpcChannel.SearchGetCampaign
  | typeof IpcChannel.SearchGetProgress
  | typeof IpcChannel.SearchListJobs;

/** Search campaign channels. They plan and inspect work; nothing here runs a website search. */
export function createSearchIpcHandlers(
  search: SearchFacade,
  handle: RequestHandlerFactory,
): Record<SearchChannel, IpcHandler> {
  return {
    [IpcChannel.SearchCreateCampaign]: handle(
      CreateSearchCampaignRequestSchema,
      (request) => search.createCampaign(request),
      { refuseDuringShutdown: true },
    ),
    [IpcChannel.SearchPlanCampaign]: handle(
      CampaignIdRequestSchema,
      (request) => search.planCampaign(request.campaignId),
      { refuseDuringShutdown: true },
    ),
    [IpcChannel.SearchListCampaigns]: handle(EmptyRequestSchema, () => search.listCampaigns()),
    [IpcChannel.SearchGetCampaign]: handle(CampaignIdRequestSchema, (request) =>
      search.getCampaign(request.campaignId),
    ),
    [IpcChannel.SearchGetProgress]: handle(CampaignIdRequestSchema, (request) =>
      search.getProgress(request.campaignId),
    ),
    [IpcChannel.SearchListJobs]: handle(ListSearchJobsRequestSchema, (request) =>
      search.listJobs(request.campaignId, { limit: request.limit, offset: request.offset }),
    ),
  };
}
