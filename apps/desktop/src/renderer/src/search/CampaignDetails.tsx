import { useState } from 'react';

import { getAtlasApi } from '../atlas-api';
import { JobsTable } from './JobsTable';
import { PlanSummary } from './PlanSummary';
import { ProgressSummary } from './ProgressSummary';
import { campaignTone, formatDateTime, statusLabel } from './search-format';
import { useCampaignDetails } from './useCampaignDetails';

interface CampaignDetailsProps {
  campaignId: string;
  onChanged: () => Promise<void>;
}

export function CampaignDetails({ campaignId, onChanged }: CampaignDetailsProps) {
  const { campaign, progress, jobs, error, reload, showMoreJobs, hasMoreJobs } =
    useCampaignDetails(campaignId);
  const [planning, setPlanning] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string }>();

  const generatePlan = async () => {
    setPlanning(true);
    setNotice(undefined);
    const result = await getAtlasApi().search.planCampaign(campaignId);
    setPlanning(false);
    if (result.ok) {
      const summary = result.data.planSummary;
      setNotice({
        kind: 'success',
        text: summary
          ? `Search plan generated: ${summary.queryCount} unique queries, ${summary.newJobCount} new jobs.`
          : 'Search plan generated.',
      });
    } else {
      setNotice({ kind: 'error', text: result.error.message });
    }
    await Promise.all([reload(), onChanged()]);
  };

  if (!campaign) {
    return (
      <section className="panel campaign-details">
        <p className="hint">{error ?? 'Loading campaign…'}</p>
      </section>
    );
  }

  return (
    <section className="panel campaign-details" aria-label="Campaign details">
      <div className="details-header">
        <div>
          <h3 className="campaign-title">{campaign.name}</h3>
          <span
            className={`status-value small tone-${campaignTone(campaign.status)}`}
            data-testid="search-campaign-status"
          >
            <span className="status-dot" aria-hidden="true" />
            {statusLabel(campaign.status)}
          </span>
        </div>
        <button
          type="button"
          className="button primary"
          disabled={planning}
          onClick={() => void generatePlan()}
        >
          {planning ? 'Generating…' : 'Generate Search Plan'}
        </button>
      </div>

      <dl className="definition-grid">
        <dt>Countries</dt>
        <dd>{campaign.countries.map((country) => country.name).join(', ')}</dd>
        <dt>Education levels</dt>
        <dd>{campaign.educationLevels.map((level) => level.name).join(', ')}</dd>
        <dt>Sources</dt>
        <dd>{campaign.sources.map((source) => source.name).join(', ')}</dd>
        <dt>Keywords</dt>
        <dd>{campaign.keywordCount} transcript keywords</dd>
        <dt>Last planned</dt>
        <dd>{formatDateTime(campaign.plannedAt)}</dd>
      </dl>

      {notice ? (
        <div className={`notice ${notice.kind}`} data-testid="search-notice">
          {notice.text}
        </div>
      ) : null}
      {campaign.lastError ? (
        <div className="notice error">Last error: {campaign.lastError}</div>
      ) : null}

      {campaign.planSummary ? (
        <PlanSummary summary={campaign.planSummary} />
      ) : (
        <p className="hint">No plan yet. Click “Generate Search Plan”.</p>
      )}
      {progress && progress.totalJobs > 0 ? <ProgressSummary progress={progress} /> : null}
      {jobs.length > 0 ? (
        <JobsTable jobs={jobs} hasMore={hasMoreJobs} onShowMore={showMoreJobs} />
      ) : null}
    </section>
  );
}
