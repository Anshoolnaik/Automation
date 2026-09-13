import type { SearchProgressDto } from '../../../shared/ipc-types';
import { formatCount, formatPercent } from './search-format';

export function ProgressSummary({ progress }: { progress: SearchProgressDto }) {
  const counts = [
    { id: 'pending', label: 'Pending', value: progress.pendingJobs },
    { id: 'running', label: 'Running', value: progress.runningJobs },
    { id: 'completed', label: 'Completed', value: progress.completedJobs },
    { id: 'failed', label: 'Failed', value: progress.failedJobs },
  ];

  return (
    <div className="progress-summary" aria-label="Progress">
      <h4 className="section-title">
        Progress <span className="hint">{formatPercent(progress.completedPercent)} complete</span>
      </h4>
      <div className="metric-grid compact">
        {counts.map((count) => (
          <div className="metric" key={count.id}>
            <div className="metric-value" data-testid={`search-progress-${count.id}`}>
              {formatCount(count.value)}
            </div>
            <div className="metric-label">{count.label}</div>
          </div>
        ))}
      </div>

      <div className="table-scroll">
        <table className="data-table" aria-label="Country summary">
          <thead>
            <tr>
              <th>Country</th>
              <th className="numeric">Jobs</th>
              <th className="numeric">Completed</th>
              <th className="numeric">Failed</th>
              <th className="numeric">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {progress.byCountry.map((country) => (
              <tr key={country.code} data-testid={`search-country-${country.code}`}>
                <td>{country.name}</td>
                <td className="numeric">{formatCount(country.total)}</td>
                <td className="numeric">{formatCount(country.completed)}</td>
                <td className="numeric">{formatCount(country.failed)}</td>
                <td className="numeric">{formatCount(country.remaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
