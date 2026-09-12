import type { Logger } from '@atlas/logger';
import { BrowserWindow } from 'electron';

import type { RendererLocation } from './renderer-location.js';

export interface MainWindowOptions {
  preloadPath: string;
  rendererLocation: RendererLocation;
  isTrustedUrl: (url: string | undefined) => boolean;
  logger: Logger;
}

export function createMainWindow(options: MainWindowOptions): BrowserWindow {
  const { logger, isTrustedUrl } = options;

  const window = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 720,
    minHeight: 560,
    title: 'Atlas Agent',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
    },
  });

  window.once('ready-to-show', () => window.show());

  const { webContents } = window;
  // The renderer never opens windows or navigates away from the bundled UI.
  webContents.setWindowOpenHandler(({ url }) => {
    logger.warn('Blocked window.open from renderer', { metadata: { url } });
    return { action: 'deny' };
  });
  webContents.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url)) {
      event.preventDefault();
      logger.warn('Blocked renderer navigation', { metadata: { url } });
    }
  });
  webContents.on('will-attach-webview', (event) => event.preventDefault());
  webContents.on('render-process-gone', (_event, details) => {
    logger.error('Renderer process exited unexpectedly', { metadata: { reason: details.reason } });
  });

  const location = options.rendererLocation;
  const load =
    location.kind === 'dev-server'
      ? window.loadURL(location.url)
      : window.loadFile(location.filePath);
  load.catch((error: unknown) => logger.error('Failed to load renderer', { metadata: { error } }));

  return window;
}
