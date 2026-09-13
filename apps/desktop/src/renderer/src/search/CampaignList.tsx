import type { SearchCampaignDto } from '../../../shared/ipc-types';
import { campaignTone, formatDateTime, statusLabel } from './search-format';

interface CampaignListProps {
  campaigns: readonly SearchCampaignDto[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

export function CampaignList({ campaigns, selectedId, onSelect }: CampaignListProps) {
  return (
    <section className="panel campaign-list" aria-label="Campaigns">
      <h3 className="panel-title">Campaigns</h3>
      {campaigns.length === 0 ? (
        <p className="hint">No campaigns yet.</p>
      ) : (
        <ul>
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <button
                type="button"
                className={`campaign-item ${campaign.id === selectedId ? 'selected' : ''}`}
                aria-current={campaign.id === selectedId}
                onClick={() => onSelect(campaign.id)}
              >
                <span className="campaign-name">{campaign.name}</span>
                <span className={`status-value small tone-${campaignTone(campaign.status)}`}>
                  <span className="status-dot" aria-hidden="true" />
                  {statusLabel(campaign.status)}
                </span>
                <span className="hint">{formatDateTime(campaign.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
