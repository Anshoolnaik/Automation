import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { readFileSync } from 'node:fs';

interface PackageJson {
  dependencies?: Record<string, string>;
}

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as PackageJson;

/**
 * Internal @atlas/* packages ship TypeScript source, so they must be bundled.
 * Third-party runtime dependencies stay external and load from node_modules.
 */
const workspacePackages = Object.keys(packageJson.dependencies ?? {}).filter((name) =>
  name.startsWith('@atlas/'),
);

export default defineConfig({
  main: {
    build: {
      externalizeDeps: { exclude: workspacePackages },
      rollupOptions: {
        // Node-only builtins that are not listed in `builtinModules`.
        external: ['node:sqlite'],
      },
    },
  },
  preload: {
    build: {
      // Sandboxed preload scripts cannot require from node_modules: bundle everything.
      externalizeDeps: false,
    },
  },
  renderer: {
    plugins: [react()],
  },
});
