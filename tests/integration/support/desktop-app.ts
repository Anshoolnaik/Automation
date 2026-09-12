import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const desktopDir = path.join(repoRoot, 'apps', 'desktop');
const mainEntry = path.join(desktopDir, 'out', 'main', 'index.js');

export function isDesktopBuilt(): boolean {
  return existsSync(mainEntry);
}

export interface LaunchedDesktop {
  app: ElectronApplication;
  window: Page;
}

/** Launches the built Atlas desktop app with an isolated userData directory. */
export async function launchDesktopApp(options: {
  userDataDir: string;
  agentPort: number;
}): Promise<LaunchedDesktop> {
  const requireFromDesktop = createRequire(path.join(desktopDir, 'package.json'));
  const electronPath = requireFromDesktop('electron') as unknown as string;

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    // Editors such as VS Code export this; it would make Electron behave like plain Node.
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
  }
  env.ATLAS_USER_DATA_DIR = options.userDataDir;
  env.ATLAS_AGENT_PORT = String(options.agentPort);
  env.NODE_ENV = 'production';

  const app = await electron.launch({
    executablePath: electronPath,
    args: [mainEntry],
    cwd: desktopDir,
    env,
    timeout: 60_000,
  });
  const window = await app.firstWindow();
  return { app, window };
}
