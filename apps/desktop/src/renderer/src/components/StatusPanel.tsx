import type { AgentStatusSnapshot } from '../../../shared/ipc-types';
import {
  agentStatusView,
  browserStatusView,
  extensionStatusView,
  type StatusView,
} from '../lib/status-labels';

interface StatusItemProps {
  id: string;
  title: string;
  view: StatusView;
  detail?: string | undefined;
}

function StatusItem({ id, title, view, detail }: StatusItemProps) {
  return (
    <div className="status-item" data-testid={`status-${id}`}>
      <div className="status-title">{title}</div>
      <div className={`status-value tone-${view.tone}`} data-testid={`status-${id}-value`}>
        <span className="status-dot" aria-hidden="true" />
        {view.label}
      </div>
      {detail ? (
        <div className="status-detail" title={detail}>
          {detail}
        </div>
      ) : null}
    </div>
  );
}

export function StatusPanel({ status }: { status: AgentStatusSnapshot }) {
  const page = status.extension.activePage;
  return (
    <section className="panel status-panel" aria-label="Status">
      <StatusItem
        id="agent"
        title="Agent Status"
        view={agentStatusView(status.agent)}
        detail={status.currentTask ? `Task: ${status.currentTask.command}` : undefined}
      />
      <StatusItem
        id="browser"
        title="Browser Status"
        view={browserStatusView(status.browser)}
        detail={status.browserMessage}
      />
      <StatusItem
        id="extension"
        title="Extension Status"
        view={extensionStatusView(status.extension.state)}
        detail={
          status.extension.state === 'CONNECTED'
            ? page && (page.title || page.url)
            : 'Load extension/dist in the Agent Browser (see README)'
        }
      />
    </section>
  );
}
