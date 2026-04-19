import { test, expect } from '@playwright/test';

// Visual regression for the full-page Settings screen.
// Pencil frames: `0qnH2` (dark) / `uWni9` (light).

type TestClaw = { __claw?: { route?: (r: unknown) => void } };

for (const theme of ['dark', 'light'] as const) {
  test(`Settings — ${theme}`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate((t: string) => {
      document.documentElement.setAttribute('data-theme', t);
      (window as unknown as TestClaw).__claw?.route?.({ kind: 'settings' });
    }, theme);
    await page.waitForTimeout(250);
    await expect(page).toHaveScreenshot(`settings-${theme}.png`, { fullPage: true });
  });
}
