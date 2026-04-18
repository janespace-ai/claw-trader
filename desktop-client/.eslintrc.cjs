/**
 * ESLint configuration for desktop-client.
 *
 * Enforces two house rules that come out of the openspec change:
 *   §15.6  — reject hardcoded hex colors inside React component files
 *            (force the use of CSS variables / Tailwind tokens so theming
 *            works uniformly).
 *   §16.20 — reject long hardcoded string literals inside JSX so every
 *            user-visible label ends up going through i18n. Short strings
 *            (≤2 chars), numbers, and strings inside // i18n-ignore comments
 *            are accepted.
 *
 * Opt-out: attach "// eslint-disable-next-line claw/no-hex-color" or
 * "// eslint-disable-next-line claw/no-raw-jsx-string" to a single line, or
 * use the standard eslint-disable block comment for a larger block.
 */

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['claw'],
  settings: {},
  overrides: [
    {
      // Only apply the token rules to component + page files; service / store
      // modules are allowed to carry raw strings for logs, errors, and seeds.
      files: ['src/components/**/*.{ts,tsx}', 'src/pages/**/*.{ts,tsx}'],
      rules: {
        'claw/no-hex-color': 'error',
        'claw/no-raw-jsx-string': 'warn',
      },
    },
  ],
  ignorePatterns: [
    'dist',
    'dist-electron',
    'node_modules',
    'src/services/browser-stub.ts',
    'src/locales/**',
    '*.config.{js,ts,cjs}',
  ],
};
