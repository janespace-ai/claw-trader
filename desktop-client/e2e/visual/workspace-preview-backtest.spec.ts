import { test, expect } from '@playwright/test';

// Visual regression for the Preview Backtest workspace screen.
// Pencil frames: `3PSG8` (dark) / `PISBa` (light).
//
// Two states per theme:
//   empty       — route into preview but no seeded verdicts (loading state)
//   with-review — verdicts pre-populated via window.__claw.seedPreviewBacktest

type TestClaw = {
  __claw?: {
    route?: (r: unknown) => void;
    seedPreviewBacktest?: (seed: unknown) => void;
  };
};

test.describe('Preview Backtest — empty state', () => {
  test('dark theme', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      (window as unknown as TestClaw).__claw?.route?.({ kind: 'workspace' });
      (window as unknown as TestClaw).__claw?.seedPreviewBacktest?.({
        taskId: 'SEED-TASK-1',
        mode: 'preview',
        focusedSymbol: 'BTC_USDT',
        verdicts: [],
      });
    });
    await page.waitForTimeout(200);
    await expect(page).toHaveScreenshot('preview-backtest-empty-dark.png', { fullPage: true });
  });

  test('light theme', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      (window as unknown as TestClaw).__claw?.route?.({ kind: 'workspace' });
      (window as unknown as TestClaw).__claw?.seedPreviewBacktest?.({
        taskId: 'SEED-TASK-1',
        mode: 'preview',
        focusedSymbol: 'BTC_USDT',
        verdicts: [],
      });
    });
    await page.waitForTimeout(200);
    await expect(page).toHaveScreenshot('preview-backtest-empty-light.png', { fullPage: true });
  });
});

test.describe('Preview Backtest — with review verdicts', () => {
  const seed = {
    taskId: 'SEED-TASK-2',
    mode: 'preview',
    focusedSymbol: 'BTC_USDT',
    verdicts: [
      { signal_id: 's1', symbol: 'BTC_USDT', entry_ts: 1_700_000_000, verdict: 'good' },
      { signal_id: 's2', symbol: 'ETH_USDT', entry_ts: 1_700_100_000, verdict: 'bad', note: 'early entry' },
      { signal_id: 's3', symbol: 'LINK_USDT', entry_ts: 1_700_200_000, verdict: 'questionable', note: 'low liquidity' },
    ],
    summary: { good: 1, questionable: 1, bad: 1 },
  };

  test('dark theme', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((s) => {
      document.documentElement.setAttribute('data-theme', 'dark');
      (window as unknown as TestClaw).__claw?.route?.({ kind: 'workspace' });
      (window as unknown as TestClaw).__claw?.seedPreviewBacktest?.(s);
    }, seed);
    await page.waitForTimeout(200);
    await expect(page).toHaveScreenshot('preview-backtest-with-review-dark.png', { fullPage: true });
  });

  test('light theme', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((s) => {
      document.documentElement.setAttribute('data-theme', 'light');
      (window as unknown as TestClaw).__claw?.route?.({ kind: 'workspace' });
      (window as unknown as TestClaw).__claw?.seedPreviewBacktest?.(s);
    }, seed);
    await page.waitForTimeout(200);
    await expect(page).toHaveScreenshot('preview-backtest-with-review-light.png', { fullPage: true });
  });
});
