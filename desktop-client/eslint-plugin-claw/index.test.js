// Tests for the custom ESLint rules: no-hex-color and no-raw-jsx-string.
//
// Using ESLint 9's legacy RuleTester via the linter API since the
// plugin is written as a traditional module.exports.rules object.

const { RuleTester } = require('eslint');
const plugin = require('./index');

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run('no-hex-color', plugin.rules['no-hex-color'], {
  valid: [
    { code: "const c = 'var(--accent-green)';" },
    { code: "const c = 'rgb(255, 0, 0)';" },
    { code: "const c = 'not-a-hex';" },
    // Shorter than 3 hex is not matched.
    { code: "const c = '#f';" },
  ],
  invalid: [
    {
      code: "const c = '#ff0000';",
      errors: [{ message: /Hardcoded hex color/ }],
    },
    {
      code: "const c = '#fff';",
      errors: [{ message: /Hardcoded hex color/ }],
    },
    {
      code: "const c = `background:#1a2b3c`;",
      errors: [{ message: /Hardcoded hex color/ }],
    },
  ],
});

ruleTester.run('no-raw-jsx-string', plugin.rules['no-raw-jsx-string'], {
  valid: [
    // t(...) call — fine.
    { code: 'const x = <div>{t("foo.bar")}</div>;' },
    // Short string — skipped.
    { code: 'const x = <div>OK</div>;' },
    // Numeric-only or symbolic — skipped.
    { code: 'const x = <div>2025</div>;' },
    // Whitespace — skipped.
    { code: 'const x = <div>   </div>;' },
  ],
  invalid: [
    {
      code: 'const x = <div>This is a long label</div>;',
      errors: [{ message: /Hardcoded JSX text/ }],
    },
    {
      code: 'const x = <input placeholder="Search strategies here" />;',
      errors: [{ message: /placeholder.*hardcoded/ }],
    },
  ],
});
