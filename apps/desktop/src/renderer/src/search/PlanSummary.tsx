import type { SearchPlanSummaryDto } from '../../../shared/ipc-types';
import { formatCount } from './search-format';

const METRICS: ReadonlyArray<{
  id: string;
  label: string;
  value: (s: SearchPlanSummaryDto) => number;
}> = [
  { id: 'countries', label: 'Countries', value: (s) => s.countryCount },
  { id: 'institutions', label: 'Institutions', value: (s) => s.institutionCount },
  { id: 'queries', label: 'Unique Queries', value: (s) => s.queryCount },
  { id: 'jobs', label: 'Search Jobs', value: (s) => s.jobCount },
  { id: 'duplicates', label: 'Duplicates Removed', value: (s) => s.duplicatesRemoved },
];

export function PlanSummary({ summary }: { summary: SearchPlanSummaryDto }) {
  return (
    <div className="plan-summary" aria-label="Plan summary">
      <div className="metric-grid">
        {METRICS.map((metric) => (
          <div className="metric" key={metric.id}>
            <div className="metric-value" data-testid={`search-summary-${metric.id}`}>
              {formatCount(metric.value(summary))}
            </div>
            <div className="metric-label">{metric.label}</div>
          </div>
        ))}
      </div>
      <p className="hint" data-testid="search-summary-last-run">
        Last run added {formatCount(summary.newQueryCount)} new queries and{' '}
        {formatCount(summary.newJobCount)} new jobs
        {summary.discardedByLimit > 0
          ? `; ${formatCount(summary.discardedByLimit)} lower-priority queries were not planned because of planning limits`
          : ''}
        .
      </p>
    </div>
  );
}
