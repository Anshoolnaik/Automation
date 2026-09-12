import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

import { DEFAULT_AGENT_PORT } from '../packages/agent-protocol/src/constants';

const manifest = JSON.parse(
  readFileSync(new URL('./public/manifest.json', import.meta.url), 'utf8'),
) as { version: string };

function resolvePort(): number {
  const raw = process.env.ATLAS_AGENT_PORT?.trim();
  if (!raw) return DEFAULT_AGENT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`ATLAS_AGENT_PORT must be an integer between 1024 and 65535, got "${raw}"`);
  }
  return port;
}

const entry = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  // The port is fixed at build time so the extension needs no storage permission.
  define: {
    __ATLAS_AGENT_PORT__: JSON.stringify(resolvePort()),
    __ATLAS_EXTENSION_VERSION__: JSON.stringify(manifest.version),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Extension pages forbid inline scripts; Vite's preload polyfill would inject one.
    modulePreload: false,
    target: 'chrome116',
    rollupOptions: {
      input: {
        'service-worker': entry('./src/background/service-worker.ts'),
        popup: entry('./src/popup/popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
