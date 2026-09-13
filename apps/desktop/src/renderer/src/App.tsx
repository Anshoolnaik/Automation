import { useState } from 'react';

import { ActivityLog } from './components/ActivityLog';
import { AgentPanel } from './components/AgentPanel';
import { TabBar, type TabId } from './components/TabBar';
import { useActivityLog } from './hooks/useActivityLog';
import { useAgentStatus } from './hooks/useAgentStatus';
import { SearchCampaignsPanel } from './search/SearchCampaignsPanel';

export function App() {
  const { status, error: statusError } = useAgentStatus();
  const entries = useActivityLog();
  const [tab, setTab] = useState<TabId>('agent');

  return (
    <div className="app">
      <header className="app-header">
        <h1>Atlas Agent</h1>
        <span className="phase-badge">Phase 2</span>
        <TabBar active={tab} onChange={setTab} />
      </header>

      {statusError ? <div className="notice error">{statusError}</div> : null}

      <main className="tab-content">
        {tab === 'agent' ? (
          status ? (
            <AgentPanel status={status} />
          ) : (
            <p className="hint">Connecting to Atlas…</p>
          )
        ) : (
          <SearchCampaignsPanel />
        )}
      </main>

      <ActivityLog entries={entries} />
    </div>
  );
}
