import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/*.config.js', '**/*.config.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Pure sim packages: no randomness, no DOM.
    files: ['packages/gx-core/src/**/*.ts', 'packages/gx-track/src/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use the seeded PRNG in gx-core.' }],
      'no-restricted-globals': ['error', 'window', 'document', 'performance', 'process', 'navigator'],
      'no-restricted-imports': ['error', { patterns: ['three', 'three/*', 'react', 'react-dom', 'node:*', 'fs', 'path'] }],
    },
  },
);
