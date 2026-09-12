import { mkdir } from 'node:fs/promises';
import nodePath from 'node:path';

/** All filesystem locations Atlas owns. Everything lives under Electron's userData directory. */
export interface AppPaths {
  userDataDir: string;
  /** Dedicated Chrome profile. Never the user's default Chrome profile; never deleted by Atlas. */
  browserProfileDir: string;
  dataDir: string;
  databaseFile: string;
  logsDir: string;
}

type PathApi = Pick<typeof nodePath, 'join' | 'isAbsolute' | 'normalize'>;

/**
 * Builds Atlas paths from `app.getPath('userData')`.
 * `pathApi` is injectable so Windows and POSIX behaviour can both be tested on any OS.
 */
export function resolveAppPaths(userDataDir: string, pathApi: PathApi = nodePath): AppPaths {
  if (!userDataDir || !pathApi.isAbsolute(userDataDir)) {
    throw new Error(`userData directory must be an absolute path, received: "${userDataDir}"`);
  }
  const root = pathApi.normalize(userDataDir);
  const dataDir = pathApi.join(root, 'data');
  return {
    userDataDir: root,
    browserProfileDir: pathApi.join(root, 'browser-profile'),
    dataDir,
    databaseFile: pathApi.join(dataDir, 'atlas.db'),
    logsDir: pathApi.join(root, 'logs'),
  };
}

export async function ensureAppDirectories(paths: AppPaths): Promise<void> {
  await Promise.all(
    [paths.browserProfileDir, paths.dataDir, paths.logsDir].map((dir) =>
      mkdir(dir, { recursive: true }),
    ),
  );
}
