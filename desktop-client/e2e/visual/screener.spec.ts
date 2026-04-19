import { test, expect } from '@playwright/test';

// Visual regression for the chart-first Screener screen.
// Pencil frames: `bnwnL` (dark) / `iFmHp` (light).

type TestClaw = {
  __claw?: {
    route?: (r: unknown) => void;
    seedScreenerRun?: (seed: unknown) => void;
  };
};

for (const theme of ['dark', 'light'] as const) {
  for (const state of ['empty', 'with-results'] as const) {
    test(`Screener — ${state} — ${theme}`, async ({ page }) => {
      await page.goto('/');
      await page.evaluate(
        (args: { theme: string; state: string }) => {
          document.documentElement.setAttribute('data-theme', args.theme);
          const claw = (window as unknown as TestClaw).__claw;
          claw?.route?.({ kind: 'screener' });
          if (args.state === 'with-results') {
            claw?.seedScreenerRun?.({
              focusedSymbol: 'BTC_USDT',
              results: [
                { symbol: 'BTC_USDT', passed: true, score: 0.92, rank: 1 },
                { symbol: 'ETH_USDT', passed: true, score: 0.81, rank: 2 },
                { symbol: 'SOL_USDT', passed: true, score: 0.74, rank: 3 },
                { symbol: 'LINK_USDT', passed: false, score: 0.42 },
                { symbol: 'AVAX_USDT', passed: false, score: 0.18 },
              ],
            });
          }
        },
        { theme, state },
      );
      await page.waitForTimeout(200);
      await expect(page).toHaveScreenshot(`screener-${state}-${theme}.png`, { fullPage: true });
    });
  }
}
