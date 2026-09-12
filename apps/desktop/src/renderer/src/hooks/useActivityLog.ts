import { useEffect, useState } from 'react';

import type { LogEntryDto } from '../../../shared/ipc-types';
import { getAtlasApi } from '../atlas-api';
import { mergeLogEntries } from '../lib/log-buffer';

export function useActivityLog(): LogEntryDto[] {
  const [entries, setEntries] = useState<LogEntryDto[]>([]);

  useEffect(() => {
    const api = getAtlasApi();
    let active = true;
    // Listen first, then request the backlog; sequence numbers remove any overlap.
    const unsubscribe = api.logs.onEntry((entry) => {
      setEntries((current) => mergeLogEntries(current, [entry]));
    });
    api.logs
      .subscribe()
      .then((result) => {
        if (active && result.ok) setEntries((current) => mergeLogEntries(current, result.data));
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return entries;
}
