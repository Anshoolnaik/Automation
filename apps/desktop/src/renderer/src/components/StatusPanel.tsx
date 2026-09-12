import type { AgentStatusSnapshot } from '../../../shared/ipc-types';
import {
  agentStatusView,
  browserStatusView,
  extensionStatusView,
  type StatusView,
} from '../lib/status-labels';

interface StatusItemProps {
  title: string;
  view: StatusView;
  detail?: string | undefined;
}

function StatusItem({ title, view, detail }: StatusItemProps) {
  return (
    <div className="status-item">
      <div className="status-title">{title}</div>
      <div className={`status-value tone-${view.tone}`}>
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
        title="Agent Status"
        view={agentStatusView(status.agent)}
        detail={status.currentTask ? `Task: ${status.currentTask.command}` : undefined}
      />
      <StatusItem
        title="Browser Status"
        view={browserStatusView(status.browser)}
        detail={status.browserMessage}
      />
      <StatusItem
        title="Extension Status"
        view={extensionStatusView(status.extension.state)}
        detail={page ? page.title || page.url : undefined}
      />
    </section>
  );
}
