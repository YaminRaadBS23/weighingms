import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'dist/',
      'coverage/',
      '.specsmd/',
      'docs/',
      'memory-bank/',
      'src/server/integrations/orgatex/dummy/migrations/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', '*.config.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'error',
    },
  },
  {
    files: ['src/web/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
