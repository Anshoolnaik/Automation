import {
  ConsoleTransport,
  createLogManager,
  MemoryTransport,
  RotatingFileTransport,
  type LogManager,
  type LogTransport,
} from '@atlas/logger';
import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'node:path';

import { IpcEvent } from '../shared/ipc-channels.js';
import { createAgentRuntime } from './agent-runtime.js';
import { ensureAppDirectories, resolveAppPaths, type AppPaths } from './app-paths.js';
import { loadAppConfig, type AppConfig } from './config.js';
import { createIpcHandlers } from './ipc/ipc-handlers.js';
import { openDatabaseForSession } from './persistence/open-database.js';
import { registerIpcHandlers } from './ipc/register-ipc.js';
import { LogBroadcaster } from './logging/log-broadcaster.js';
import { createSearchRuntime } from './search/search-runtime.js';
import { runShutdownSteps, type ShutdownStep } from './shutdown/run-shutdown.js';
import { createMainWindow } from './window/create-main-window.js';
import { hardenSession } from './window/harden-session.js';
import { createTrustedUrlCheck, resolveRendererLocation } from './window/renderer-location.js';

export interface AtlasApplication {
  readonly config: AppConfig;
  readonly paths: AppPaths;
  openMainWindow(): BrowserWindow;
  shutdown(): Promise<void>;
}

/** Composition root: builds every service and wires them together. */
export async function bootstrapAtlas(): Promise<AtlasApplication> {
  const config = loadAppConfig(process.env, { isPackaged: app.isPackaged });
  const paths = resolveAppPaths(app.getPath('userData'));
  await ensureAppDirectories(paths);

  const uiLogs = new MemoryTransport({ capacity: 1_000, minLevel: 'info' });
  const logManager = createLogs(config, paths, uiLogs);
  const logger = logManager.forComponent('app');
  logger.info('Agent started', {
    metadata: {
      version: app.getVersion(),
      platform: process.platform,
      userData: paths.userDataDir,
    },
  });

  // Throws if the database cannot be opened; startup then fails with a dialog.
  const { database, agentRunId } = openDatabaseForSession(
    paths.databaseFile,
    logManager.forComponent('database'),
  );
  const runtime = createAgentRuntime({ config, paths, logs: logManager, database, agentRunId });
  const search = createSearchRuntime({ database, logs: logManager });
  const agent = runtime.facade;
  await runtime.start();

  const rendererLocation = resolveRendererLocation({
    isPackaged: app.isPackaged,
    devServerUrl: process.env.ELECTRON_RENDERER_URL,
    mainDir: __dirname,
  });
  const isTrustedUrl = createTrustedUrlCheck(rendererLocation);
  hardenSession(session.defaultSession);

  let shuttingDown = false;
  const logBroadcaster = new LogBroadcaster(uiLogs);
  const unregisterIpc = registerIpcHandlers({
    ipcMain,
    isTrustedUrl,
    logger: logManager.forComponent('ipc'),
    handlers: createIpcHandlers({
      agent,
      search: search.facade,
      logs: logBroadcaster,
      logger: logManager.forComponent('ipc'),
      isShuttingDown: () => shuttingDown,
    }),
  });

  const stopStatusBroadcast = agent.onStatusChanged((snapshot) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) {
        window.webContents.send(IpcEvent.StatusChanged, snapshot);
      }
    }
  });

  const shutdownSteps: ShutdownStep[] = [
    {
      name: 'stop-accepting-requests',
      run: () => {
        shuttingDown = true;
        stopStatusBroadcast();
      },
    },
    ...runtime.shutdownSteps,
    {
      // After the browser and server have stopped, so no writes are lost.
      name: 'flush-and-close-database',
      run: () => {
        database.agentRuns.stop(agentRunId);
        database.close();
      },
    },
    { name: 'unregister-ipc', run: unregisterIpc },
    {
      name: 'flush-logs',
      run: async () => {
        logger.info('Agent stopped');
        logBroadcaster.dispose();
        await logManager.close();
      },
    },
  ];

  let shutdownPromise: Promise<void> | undefined;

  return {
    config,
    paths,
    openMainWindow: () =>
      createMainWindow({
        preloadPath: path.join(__dirname, '../preload/index.js'),
        rendererLocation,
        isTrustedUrl,
        logger: logManager.forComponent('window'),
      }),
    shutdown: () => {
      shutdownPromise ??= (async () => {
        logger.info('Shutting down Atlas Agent');
        await runShutdownSteps(shutdownSteps, logManager.forComponent('shutdown'));
      })();
      return shutdownPromise;
    },
  };
}

function createLogs(config: AppConfig, paths: AppPaths, uiLogs: MemoryTransport): LogManager {
  const transports: LogTransport[] = [
    uiLogs,
    new RotatingFileTransport({
      directory: paths.logsDir,
      fileName: 'atlas.log',
      minLevel: 'debug',
    }),
  ];
  if (config.isDevelopment) transports.push(new ConsoleTransport(config.logLevel));
  return createLogManager({ transports, minLevel: config.logLevel });
}
