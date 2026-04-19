#!/usr/bin/env node
// A11y contrast audit — launches Playwright against every screen in
// both themes, injects axe-core, and writes a JSON report to
// `playwright-report/a11y-contrast.json`.
//
// This script is a thin driver; actual axe rules are stock. Install
// axe-core and @axe-core/playwright first:
//
//   pnpm add -D axe-core @axe-core/playwright
//
// Then run:
//
//   node scripts/a11y-contrast.mjs
//
// CI wires this into `make test-a11y`. Light theme is the typical
// failure mode — fg-muted on surface-secondary frequently fails AA.

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SCREENS = [
  { path: '/', kind: 'workspace' },
  { path: '/', kind: 'screener' },
  { path: '/', kind: 'strategies' },
  { path: '/', kind: 'settings' },
];

async function audit() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  // The renderer exposes `window.__claw` in DEV; we rely on it to
  // swap routes without app-specific navigation code.
  const report = [];
  for (const { kind } of SCREENS) {
    for (const theme of ['dark', 'light']) {
      await page.goto('http://localhost:5173/');
      await page.evaluate(
        (args) => {
          document.documentElement.setAttribute('data-theme', args.theme);
          window.__claw?.route?.({ kind: args.kind });
        },
        { kind, theme },
      );
      await page.waitForTimeout(300);
      // axe-core is loaded from CDN so this script doesn't require a
      // bundler. In CI we'd pin a local copy instead.
      await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/axe-core@4.10.0/axe.min.js' });
      const results = await page.evaluate(async () => {
        // @ts-expect-error -- injected global
        return await axe.run({ runOnly: { type: 'rule', values: ['color-contrast'] } });
      });
      report.push({ kind, theme, violations: results.violations });
    }
  }
  const outPath = resolve(process.cwd(), 'playwright-report/a11y-contrast.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  // eslint-disable-next-line no-console
  console.log(`Wrote ${outPath} with ${report.length} entries.`);
  await browser.close();
}

audit().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
