import type { BrowserState } from '@atlas/agent-protocol';

import { canLaunchBrowser, canStopBrowser } from '../lib/status-labels';

interface BrowserControlsProps {
  browser: BrowserState;
  busy: boolean;
  onLaunch: () => void;
  onStop: () => void;
}

export function BrowserControls({ browser, busy, onLaunch, onStop }: BrowserControlsProps) {
  return (
    <section className="panel controls" aria-label="Browser controls">
      <button
        type="button"
        className="button primary"
        disabled={busy || !canLaunchBrowser(browser)}
        onClick={onLaunch}
      >
        Launch Agent Browser
      </button>
      <button
        type="button"
        className="button"
        disabled={busy || !canStopBrowser(browser)}
        onClick={onStop}
      >
        Stop Browser
      </button>
    </section>
  );
}
