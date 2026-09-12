import { AgentService, BrowserSession, noopBrowserEventRecorder } from '@atlas/agent-core';
import { PlaywrightBrowserController } from '@atlas/browser-core/playwright';
import type { LogManager } from '@atlas/logger';

import { createAgentFacade, type AgentFacade } from './agent-facade.js';
import type { AppPaths } from './app-paths.js';
import type { AppConfig } from './config.js';
import type { ShutdownStep } from './shutdown/run-shutdown.js';

export interface AgentRuntime {
  facade: AgentFacade;
  /** Ordered steps that stop the agent's services; run before logs are flushed. */
  shutdownSteps: ShutdownStep[];
}

/** Builds the agent's services (browser, …) from configuration. */
export function createAgentRuntime(options: {
  config: AppConfig;
  paths: AppPaths;
  logs: LogManager;
}): AgentRuntime {
  const { config, paths, logs } = options;

  const controller = new PlaywrightBrowserController({
    profileDir: paths.browserProfileDir,
    executablePath: config.chromeExecutablePath,
    logger: logs.forComponent('browser'),
  });
  const browser = new BrowserSession(
    controller,
    logs.forComponent('browser-session'),
    noopBrowserEventRecorder,
  );
  const service = new AgentService({ browser, logger: logs.forComponent('agent') });

  return {
    facade: createAgentFacade(service),
    shutdownSteps: [
      // Closing the Playwright context cleanly lets Chrome persist cookies and session data.
      { name: 'stop-agent-and-close-browser', run: () => service.shutdown(), timeoutMs: 15_000 },
    ],
  };
}
