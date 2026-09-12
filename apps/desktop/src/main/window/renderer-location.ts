import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where the renderer UI is served from: the Vite dev server in development, a file otherwise. */
export type RendererLocation =
  { kind: 'dev-server'; url: string } | { kind: 'file'; filePath: string };

export function resolveRendererLocation(options: {
  isPackaged: boolean;
  devServerUrl: string | undefined;
  mainDir: string;
}): RendererLocation {
  if (!options.isPackaged && options.devServerUrl) {
    return { kind: 'dev-server', url: options.devServerUrl };
  }
  return { kind: 'file', filePath: nodePath.join(options.mainDir, '../renderer/index.html') };
}

/**
 * Returns a predicate that accepts only URLs belonging to the Atlas renderer.
 * Used to validate IPC senders and to block unexpected navigation.
 */
export function createTrustedUrlCheck(
  location: RendererLocation,
  platform: NodeJS.Platform = process.platform,
): (url: string | undefined) => boolean {
  if (location.kind === 'dev-server') {
    const expectedOrigin = safeOrigin(location.url);
    return (url) =>
      url !== undefined && expectedOrigin !== undefined && safeOrigin(url) === expectedOrigin;
  }

  const pathApi = platform === 'win32' ? nodePath.win32 : nodePath.posix;
  const normalize = (filePath: string) => {
    const normalized = pathApi.normalize(filePath);
    return platform === 'win32' || platform === 'darwin' ? normalized.toLowerCase() : normalized;
  };
  const expectedPath = normalize(location.filePath);

  return (url) => {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'file:') return false;
      parsed.hash = '';
      parsed.search = '';
      return normalize(fileURLToPath(parsed, { windows: platform === 'win32' })) === expectedPath;
    } catch {
      return false;
    }
  };
}

function safeOrigin(url: string): string | undefined {
  try {
    const origin = new URL(url).origin;
    return origin === 'null' ? undefined : origin;
  } catch {
    return undefined;
  }
}
