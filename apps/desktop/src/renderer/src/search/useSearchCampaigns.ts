import { useCallback, useEffect, useState } from 'react';

import type { SearchCampaignDto } from '../../../shared/ipc-types';
import { getAtlasApi } from '../atlas-api';

export function useSearchCampaigns() {
  const [campaigns, setCampaigns] = useState<SearchCampaignDto[]>([]);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    const result = await getAtlasApi().search.listCampaigns();
    if (result.ok) {
      setCampaigns(result.data);
      setError(undefined);
    } else {
      setError(result.error.message);
    }
  }, []);

  useEffect(() => {
    getAtlasApi()
      .search.listCampaigns()
      .then((result) => {
        if (result.ok) setCampaigns(result.data);
        else setError(result.error.message);
      })
      .catch((reason: unknown) => setError(String(reason)));
  }, []);

  return { campaigns, error, refresh };
}
