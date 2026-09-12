import { useEffect, useState } from 'react';

import type { AgentStatusSnapshot } from '../../../shared/ipc-types';
import { getAtlasApi } from '../atlas-api';

export function useAgentStatus(): {
  status: AgentStatusSnapshot | undefined;
  error: string | undefined;
} {
  const [status, setStatus] = useState<AgentStatusSnapshot>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const api = getAtlasApi();
    let active = true;
    const unsubscribe = api.agent.onStatusChanged((snapshot) => setStatus(snapshot));
    api.agent
      .getStatus()
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          // A pushed update may already be newer than this initial snapshot.
          setStatus((current) => current ?? result.data);
        } else {
          setError(result.error.message);
        }
      })
      .catch((reason: unknown) => active && setError(String(reason)));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { status, error };
}
