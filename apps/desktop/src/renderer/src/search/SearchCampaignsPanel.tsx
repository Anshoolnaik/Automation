import { useState } from 'react';

import { TEST_CAMPAIGN_PRESET } from '../../../shared/search-vocabulary';
import { getAtlasApi } from '../atlas-api';
import { CampaignDetails } from './CampaignDetails';
import { CampaignList } from './CampaignList';
import { useSearchCampaigns } from './useSearchCampaigns';

/** Phase 2: create campaigns and generate persistent search plans. Nothing is executed. */
export function SearchCampaignsPanel() {
  const { campaigns, error, refresh } = useSearchCampaigns();
  const [selectedId, setSelectedId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string>();

  const selected = selectedId ?? campaigns[0]?.id;

  const createTestCampaign = async () => {
    setCreating(true);
    setNotice(undefined);
    const result = await getAtlasApi().search.createCampaign({
      name: TEST_CAMPAIGN_PRESET.name,
      countries: [...TEST_CAMPAIGN_PRESET.countries],
      educationLevels: [...TEST_CAMPAIGN_PRESET.educationLevels],
      sourceIds: [...TEST_CAMPAIGN_PRESET.sourceIds],
    });
    setCreating(false);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    await refresh();
    setSelectedId(result.data.id);
  };

  return (
    <div className="search-panel">
      <section className="panel search-intro">
        <div>
          <h2 className="panel-title">Search Campaigns</h2>
          <p className="hint">
            Phase 2 turns a collection request into persistent, de-duplicated search jobs. Jobs are
            planned and stored only; nothing is searched on any website yet.
          </p>
        </div>
        <button
          type="button"
          className="button primary"
          disabled={creating}
          onClick={() => void createTestCampaign()}
        >
          Create Test Campaign
        </button>
      </section>

      {notice || error ? <div className="notice error">{notice ?? error}</div> : null}

      <div className="search-layout">
        <CampaignList campaigns={campaigns} selectedId={selected} onSelect={setSelectedId} />
        {selected ? (
          <CampaignDetails key={selected} campaignId={selected} onChanged={refresh} />
        ) : (
          <section className="panel">
            <p className="hint">Create a campaign to generate a search plan.</p>
          </section>
        )}
      </div>
    </div>
  );
}
