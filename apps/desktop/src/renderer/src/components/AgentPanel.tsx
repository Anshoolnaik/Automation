import { useState } from 'react';

import type { AgentStatusSnapshot, IpcResult } from '../../../shared/ipc-types';
import { getAtlasApi } from '../atlas-api';
import { canRunTask } from '../lib/status-labels';
import { BrowserControls } from './BrowserControls';
import { CommandForm } from './CommandForm';
import { StatusPanel } from './StatusPanel';

type Notice = { kind: 'error' | 'success'; text: string };

/** Phase-1 agent controls: statuses, browser launch/stop and task commands. */
export function AgentPanel({ status }: { status: AgentStatusSnapshot }) {
  const [pendingAction, setPendingAction] = useState<'browser' | 'task'>();
  const [notice, setNotice] = useState<Notice>();

  const perform = async <T,>(
    kind: 'browser' | 'task',
    action: () => Promise<IpcResult<T>>,
    describeSuccess?: (data: T) => Notice | undefined,
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
      {notice ? <div className={`notice ${notice.kind}`}>{notice.text}</div> : null}
    </>
  );
}
