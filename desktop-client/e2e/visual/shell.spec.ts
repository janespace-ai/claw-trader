import { test, expect } from '@playwright/test';

// Baseline visual-regression tests for `ui-foundation` primitives. Per-
// screen specs land in their respective screen changes (#4-#12).
//
// This spec captures the empty WorkspaceShell + AIPersonaShell skeleton
// in both themes — it establishes that the harness works and gives us
// a floor to detect regressions in the layout primitives themselves.
//
// NOTE: running `pnpm test:visual` the first time will fail due to
// missing baseline PNGs. Run `pnpm test:visual:update` once to seed,
// commit the screenshots, then subsequent runs compare.

test.describe('WorkspaceShell — empty state', () => {
  test('dark theme', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    // Give React a tick to apply theme CSS vars.
    await page.waitForTimeout(100);
    await expect(page).toHaveScreenshot('shell-empty-dark.png', { fullPage: true });
  });

  test('light theme', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.waitForTimeout(100);
    await expect(page).toHaveScreenshot('shell-empty-light.png', { fullPage: true });
  });
});
