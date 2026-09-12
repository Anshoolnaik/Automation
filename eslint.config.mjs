// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/node_modules/', '**/dist/', '**/out/', '**/coverage/', 'eslint.config.mjs']),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
    },
  },
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['extension/src/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.webextensions } },
  },
  {
    // Console output is the purpose of the console transport; tests may print diagnostics.
    files: ['packages/logger/src/transports/console-transport.ts', '**/*.test.ts', 'tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
