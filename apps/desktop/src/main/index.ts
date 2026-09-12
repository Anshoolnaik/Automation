import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';

import { bootstrapAtlas, type AtlasApplication } from './bootstrap.js';

// Optional isolated data root (automated tests, portable setups). Must be set before `ready`.
const userDataOverride = process.env.ATLAS_USER_DATA_DIR?.trim();
if (userDataOverride) {
  app.setPath('userData', path.resolve(userDataOverride));
}

// Two Atlas instances would fight over the same Chrome profile and WebSocket port.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  startApplication();
}

function startApplication(): void {
  let atlas: AtlasApplication | undefined;
  let mainWindow: BrowserWindow | undefined;
  let shutdownComplete = false;

  const showWindow = () => {
    if (!atlas) return;
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = atlas.openMainWindow();
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  };

  app.on('second-instance', showWindow);

  app
    .whenReady()
    .then(async () => {
      atlas = await bootstrapAtlas();
      showWindow();
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) showWindow();
      });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      dialog.showErrorBox('Atlas Agent failed to start', message);
      shutdownComplete = true;
      app.exit(1);
    });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // Graceful shutdown: hold the quit until services have been stopped and flushed.
  app.on('before-quit', (event) => {
    if (shutdownComplete || !atlas) return;
    event.preventDefault();
    atlas
      .shutdown()
      .finally(() => {
        shutdownComplete = true;
        app.quit();
      })
      .catch(() => undefined);
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => app.quit());
  }
}
