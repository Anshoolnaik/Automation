import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type BrowserContext } from 'playwright-core';
import { build } from 'vite';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const extensionDir = path.join(repoRoot, 'extension');

/** Builds the extension into `outDir` with the agent port baked in. */
export async function buildExtension(outDir: string, agentPort: number): Promise<void> {
  const previous = process.env.ATLAS_AGENT_PORT;
  process.env.ATLAS_AGENT_PORT = String(agentPort);
  try {
    await build({
      root: extensionDir,
      configFile: path.join(extensionDir, 'vite.config.ts'),
      logLevel: 'error',
      build: { outDir, emptyOutDir: true },
    });
  } finally {
    if (previous === undefined) delete process.env.ATLAS_AGENT_PORT;
    else process.env.ATLAS_AGENT_PORT = previous;
  }
}

/**
 * Launches Google Chrome and installs the unpacked extension through the
 * DevTools protocol. Google Chrome no longer honours --load-extension, and
 * `Extensions.loadUnpacked` requires --enable-unsafe-extension-debugging.
 * TEST-ONLY: the Atlas app never uses this flag; users load the extension manually.
 */
export async function launchChromeWithExtension(options: {
  profileDir: string;
  extensionDir: string;
  headless?: boolean;
}): Promise<{ context: BrowserContext; extensionId: string }> {
  const context = await chromium.launchPersistentContext(options.profileDir, {
    channel: 'chrome',
    headless: options.headless ?? false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const browser = context.browser();
  if (!browser) throw new Error('Persistent context did not expose a browser for CDP');
  const session = await browser.newBrowserCDPSession();
  const { id } = (await session.send(
    'Extensions.loadUnpacked' as never,
    {
      path: options.extensionDir,
    } as never,
  )) as { id: string };
  await session.detach();
  return { context, extensionId: id };
}
