import { AgentService, BrowserSession, TaskRunner } from '@atlas/agent-core';
import { AgentServer } from '@atlas/agent-server';
import { PlaywrightBrowserController } from '@atlas/browser-core/playwright';
import { createPhaseOneCommandParser } from '@atlas/command-parser';
import type { AtlasDatabase } from '@atlas/database';
import type { LogManager } from '@atlas/logger';

import { createAgentFacade, type AgentFacade } from './agent-facade.js';
import type { AppPaths } from './app-paths.js';
import type { AppConfig } from './config.js';
import { WebSocketExtensionChannel } from './extension/websocket-extension-channel.js';
import { createDatabaseEventRecorder } from './persistence/database-event-recorder.js';
import type { ShutdownStep } from './shutdown/run-shutdown.js';

export interface AgentRuntime {
  facade: AgentFacade;
  /** Starts background services (the local WebSocket server). */
  start(): Promise<void>;
  /** Ordered steps that stop the agent's services; run before logs are flushed. */
  shutdownSteps: ShutdownStep[];
}

/** Builds the agent's services from configuration. The database is owned (and closed) by the caller. */
export function createAgentRuntime(options: {
  config: AppConfig;
  paths: AppPaths;
  logs: LogManager;
  database: AtlasDatabase;
  agentRunId: string;
}): AgentRuntime {
  const { config, paths, logs, database, agentRunId } = options;
  const events = createDatabaseEventRecorder(database.browserEvents, logs.forComponent('database'));

  const server = new AgentServer({
    port: config.agentPort,
    allowedExtensionIds: config.allowedExtensionIds,
    logger: logs.forComponent('agent-server'),
  });
  const extension = new WebSocketExtensionChannel(server, logs.forComponent('extension'));

  const controller = new PlaywrightBrowserController({
    profileDir: paths.browserProfileDir,
    executablePath: config.chromeExecutablePath,
    logger: logs.forComponent('browser'),
  });
  const browser = new BrowserSession(controller, logs.forComponent('browser-session'), events);
  const tasks = new TaskRunner({
    tasks: database.tasks,
    checkpoints: database.checkpoints,
    events,
    parser: createPhaseOneCommandParser(),
    getBrowser: () => browser.requireRunningController(),
    logger: logs.forComponent('task'),
    agentRunId,
  });
  const service = new AgentService({
    browser,
    tasks,
    extension,
    events,
    logger: logs.forComponent('agent'),
  });

  return {
    facade: createAgentFacade(service),
    start: async () => {
      try {
        await server.start();
      } catch (error) {
        // The app stays usable without the extension link; the UI shows it as disconnected.
        logs.forComponent('agent-server').error('Local agent server could not start', {
          metadata: { error },
        });
      }
    },
    shutdownSteps: [
      { name: 'stop-accepting-tasks', run: () => service.stopAcceptingTasks(), timeoutMs: 15_000 },
      {
        name: 'close-websocket-server',
        run: async () => {
          extension.dispose();
          await server.stop();
        },
      },
      {
        // Closing the Playwright context cleanly lets Chrome persist cookies and session data.
        // The profile directory itself is never deleted.
        name: 'close-browser',
        run: async () => {
          await service.stopBrowser();
          service.dispose();
        },
        timeoutMs: 15_000,
      },
    ],
  };
}
