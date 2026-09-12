import { defineConfig } from 'vitest/config';

/**
 * Integration tests: may launch a real Chrome and bind localhost ports.
 * Browser-dependent suites skip themselves when Chrome is unavailable
 * or when ATLAS_SKIP_BROWSER_TESTS=1 (the default in CI).
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.int.test.ts'],
    environment: 'node',
    testTimeout: 90_000,
    hookTimeout: 90_000,
    // Real browsers share machine resources; run suites one at a time.
    fileParallelism: false,
  },
});
