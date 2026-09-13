import { useCallback, useEffect, useState } from 'react';

import type { SearchCampaignDto, SearchJobDto, SearchProgressDto } from '../../../shared/ipc-types';
import { getAtlasApi } from '../atlas-api';

export const JOB_PAGE_SIZE = 25;

interface Details {
  campaign?: SearchCampaignDto;
  progress?: SearchProgressDto;
  jobs: SearchJobDto[];
  error?: string;
}

async function loadDetails(campaignId: string, jobLimit: number): Promise<Details> {
  const api = getAtlasApi().search;
  const [campaign, progress, jobs] = await Promise.all([
    api.getCampaign(campaignId),
    api.getProgress(campaignId),
    api.listJobs(campaignId, { limit: jobLimit, offset: 0 }),
  ]);
  const failure = [campaign, progress, jobs].find((result) => !result.ok);
  return {
    ...(campaign.ok && { campaign: campaign.data }),
    ...(progress.ok && { progress: progress.data }),
    jobs: jobs.ok ? jobs.data : [],
    ...(failure && !failure.ok && { error: failure.error.message }),
  };
}

/** Loads one campaign with its progress and the highest-priority jobs. Mount with `key={campaignId}`. */
export function useCampaignDetails(campaignId: string) {
  const [details, setDetails] = useState<Details>({ jobs: [] });
  const [jobLimit, setJobLimit] = useState(JOB_PAGE_SIZE);

  useEffect(() => {
    let active = true;
    loadDetails(campaignId, jobLimit)
      .then((loaded) => {
        if (active) setDetails(loaded);
      })
      .catch((reason: unknown) => {
        if (active) setDetails((current) => ({ ...current, error: String(reason) }));
      });
    return () => {
      active = false;
    };
  }, [campaignId, jobLimit]);

  const reload = useCallback(async () => {
    setDetails(await loadDetails(campaignId, jobLimit));
  }, [campaignId, jobLimit]);

  const showMoreJobs = useCallback(() => setJobLimit((limit) => limit + JOB_PAGE_SIZE), []);

  const totalJobs = details.progress?.totalJobs ?? 0;
  return { ...details, reload, showMoreJobs, hasMoreJobs: details.jobs.length < totalJobs };
}
