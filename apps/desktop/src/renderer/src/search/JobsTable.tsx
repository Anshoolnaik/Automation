import type { SearchJobDto } from '../../../shared/ipc-types';
import { jobTone, statusLabel } from './search-format';

interface JobsTableProps {
  jobs: readonly SearchJobDto[];
  hasMore: boolean;
  onShowMore: () => void;
}

export function JobsTable({ jobs, hasMore, onShowMore }: JobsTableProps) {
  return (
    <div className="jobs" aria-label="Search jobs">
      <h4 className="section-title">
        Search jobs <span className="hint">highest priority first · not executed in Phase 2</span>
      </h4>
      <div className="table-scroll">
        <table className="data-table" aria-label="Search jobs">
          <thead>
            <tr>
              <th className="numeric">Priority</th>
              <th>Query</th>
              <th>Country</th>
              <th>Institution</th>
              <th>Source</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td className="numeric">{job.priority}</td>
                <td className="query-text">{job.queryText}</td>
                <td>{job.countryName}</td>
                <td>{job.institutionName ?? '—'}</td>
                <td>{job.sourceName}</td>
                <td>
                  <span className={`status-value small tone-${jobTone(job.status)}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {statusLabel(job.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore ? (
        <button type="button" className="button" onClick={onShowMore}>
          Show more jobs
        </button>
      ) : null}
    </div>
  );
}
