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

async function loadDetails(campaignId: string): Promise<Details> {
  const api = getAtlasApi().search;
  const [campaign, progress, jobs] = await Promise.all([
    api.getCampaign(campaignId),
    api.getProgress(campaignId),
    api.listJobs(campaignId, { limit: JOB_PAGE_SIZE, offset: 0 }),
  ]);
  const failure = [campaign, progress, jobs].find((result) => !result.ok);
  return {
    ...(campaign.ok && { campaign: campaign.data }),
    ...(progress.ok && { progress: progress.data }),
    jobs: jobs.ok ? jobs.data : [],
    ...(failure && !failure.ok && { error: failure.error.message }),
  };
}

/**
 * Loads one campaign with its progress and the first page of jobs; more jobs are
 * fetched page by page. Mount with `key={campaignId}` so state resets per campaign.
 */
export function useCampaignDetails(campaignId: string) {
  const [details, setDetails] = useState<Details>({ jobs: [] });

  useEffect(() => {
    let active = true;
    loadDetails(campaignId)
      .then((loaded) => {
        if (active) setDetails(loaded);
      })
      .catch((reason: unknown) => {
        if (active) setDetails((current) => ({ ...current, error: String(reason) }));
      });
    return () => {
      active = false;
    };
  }, [campaignId]);

  const reload = useCallback(async () => {
    setDetails(await loadDetails(campaignId));
  }, [campaignId]);

  const loadedJobs = details.jobs.length;
  const showMoreJobs = useCallback(async () => {
    const result = await getAtlasApi().search.listJobs(campaignId, {
      limit: JOB_PAGE_SIZE,
      offset: loadedJobs,
    });
    setDetails((current) =>
      result.ok
        ? { ...current, jobs: [...current.jobs, ...result.data] }
        : { ...current, error: result.error.message },
    );
  }, [campaignId, loadedJobs]);

  const totalJobs = details.progress?.totalJobs ?? 0;
  return { ...details, reload, showMoreJobs, hasMoreJobs: loadedJobs < totalJobs };
}
