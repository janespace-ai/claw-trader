import { test, expect } from '@playwright/test';

// Visual regression for the Multi-Symbol Grid view mode.
// Pencil frames: `nvBnq` (dark) / `wBWkN` (light).

type TestClaw = {
  __claw?: {
    route?: (r: unknown) => void;
    setWorkspaceViewMode?: (m: 'chart' | 'grid') => void;
  };
};

for (const theme of ['dark', 'light'] as const) {
  test(`Multi-symbol grid — ${theme}`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate((t: string) => {
      document.documentElement.setAttribute('data-theme', t);
      const claw = (window as unknown as TestClaw).__claw;
      claw?.route?.({ kind: 'workspace' });
      claw?.setWorkspaceViewMode?.('grid');
    }, theme);
    await page.waitForTimeout(250);
    await expect(page).toHaveScreenshot(`multi-symbol-grid-${theme}.png`, { fullPage: true });
  });
}
