import { defineConfig } from 'vitest/config';

/** Unit tests: fast, no real browser, no network. */
export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'extension/src/**/*.test.ts',
    ],
    environment: 'node',
    restoreMocks: true,
  },
});
