import { useState } from 'react';

import type { IpcResult } from '../../shared/ipc-types';
import { getAtlasApi } from './atlas-api';
import { ActivityLog } from './components/ActivityLog';
import { BrowserControls } from './components/BrowserControls';
import { CommandForm } from './components/CommandForm';
import { StatusPanel } from './components/StatusPanel';
import { useActivityLog } from './hooks/useActivityLog';
import { useAgentStatus } from './hooks/useAgentStatus';
import { canRunTask } from './lib/status-labels';

export function App() {
  const { status, error: statusError } = useAgentStatus();
  const entries = useActivityLog();
  const [pendingAction, setPendingAction] = useState<'browser' | 'task'>();
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string }>();

  const perform = async <T,>(
    kind: 'browser' | 'task',
    action: () => Promise<IpcResult<T>>,
    describeSuccess?: (data: T) => { kind: 'error' | 'success'; text: string } | undefined,
  ) => {
    setPendingAction(kind);
    setNotice(undefined);
    try {
      const result = await action();
      setNotice(
        result.ok ? describeSuccess?.(result.data) : { kind: 'error', text: result.error.message },
      );
    } catch (reason) {
      setNotice({ kind: 'error', text: String(reason) });
    } finally {
      setPendingAction(undefined);
    }
  };

  const api = getAtlasApi();

  return (
    <div className="app">
      <header className="app-header">
        <h1>Atlas Agent</h1>
        <span className="phase-badge">Phase 1</span>
      </header>

      {statusError ? <div className="notice error">{statusError}</div> : null}

      {status ? (
        <>
          <StatusPanel status={status} />
          <BrowserControls
            browser={status.browser}
            busy={pendingAction === 'browser'}
            onLaunch={() => void perform('browser', () => api.browser.launch())}
            onStop={() => void perform('browser', () => api.browser.stop())}
          />
          <CommandForm
            enabled={canRunTask(status.agent, status.browser)}
            running={pendingAction === 'task' || status.agent === 'RUNNING'}
            onRun={(command) =>
              perform(
                'task',
                () => api.tasks.run(command),
                (task) =>
                  task.status === 'COMPLETED'
                    ? {
                        kind: 'success',
                        text: `Task completed${task.finalTitle ? `: ${task.finalTitle}` : ''}`,
                      }
                    : {
                        kind: 'error',
                        text: task.errorMessage ?? `Task ${task.status.toLowerCase()}`,
                      },
              )
            }
          />
        </>
      ) : (
        <p className="hint">Connecting to Atlas…</p>
      )}

      {notice ? <div className={`notice ${notice.kind}`}>{notice.text}</div> : null}

      <ActivityLog entries={entries} />
    </div>
  );
}
