import { test, expect } from '@playwright/test';

// Visual regression for the Symbol Detail drill-down screen.
// Pencil frames: `s9ooT` (dark) / `Aib9J` (light).

type TestClaw = {
  __claw?: { route?: (r: unknown) => void };
};

for (const theme of ['dark', 'light'] as const) {
  test(`Symbol Detail — BTC_USDT — ${theme}`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate((t: string) => {
      document.documentElement.setAttribute('data-theme', t);
      (window as unknown as TestClaw).__claw?.route?.({
        kind: 'symbol-detail',
        symbol: 'BTC_USDT',
        returnTo: { kind: 'workspace' },
      });
    }, theme);
    await page.waitForTimeout(250);
    await expect(page).toHaveScreenshot(`symbol-detail-${theme}.png`, { fullPage: true });
  });
}
