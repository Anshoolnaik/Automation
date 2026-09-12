import { useEffect, useRef } from 'react';

import type { LogEntryDto } from '../../../shared/ipc-types';
import { formatLogTime } from '../lib/log-buffer';

export function ActivityLog({ entries }: { entries: readonly LogEntryDto[] }) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [entries]);

  return (
    <section className="panel activity" aria-label="Activity log">
      <h2 className="panel-title">Activity</h2>
      {entries.length === 0 ? (
        <p className="hint">No activity yet.</p>
      ) : (
        <ol className="log-list" ref={listRef}>
          {entries.map((entry) => (
            <li key={entry.seq} className={`log-entry level-${entry.level}`}>
              <time className="log-time" dateTime={entry.timestamp}>
                {formatLogTime(entry.timestamp)}
              </time>
              <span className="log-message">{entry.message}</span>
              <span className="log-component">{entry.component}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
