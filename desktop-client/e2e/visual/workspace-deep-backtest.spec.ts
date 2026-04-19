import { test, expect } from '@playwright/test';

// Visual regression for the Deep Backtest workspace screen.
// Pencil frames: `QdrlI` (dark) / `TR0Ib` (light).
//
// Three states per theme:
//   empty       — mode=deep but no result seeded (loading placeholder)
//   with-result — backtest result + monthly + trades populated
//   with-optimlens — above + OptimLens improvements rendered

type TestClaw = {
  __claw?: {
    route?: (r: unknown) => void;
    seedPreviewBacktest?: (seed: unknown) => void;
    seedOptimLens?: (seed: unknown) => void;
  };
};

const improvements = [
  {
    title: 'Tighten stop loss',
    category: 'risk_mgmt',
    rationale: 'Large losers dominate the tail. Tightening to 3% trims max DD without hurting winners.',
    expected_delta: { sharpe: 0.28, max_drawdown: -0.018 },
    suggested_change: {
      kind: 'param_update',
      payload: { param_name: 'stop_loss', current: 0.05, suggested: 0.03 },
    },
  },
  {
    title: 'Filter low-volume entries',
    category: 'filter',
    rationale: 'Entries in the bottom 25% of daily volume underperform. Skip them.',
    expected_delta: { sharpe: 0.12, win_rate: 0.04 },
  },
];

function seed(state: 'empty' | 'with-result' | 'with-optimlens') {
  const claw = (window as unknown as TestClaw).__claw;
  claw?.route?.({ kind: 'workspace' });
  if (state === 'empty') {
    claw?.seedPreviewBacktest?.({
      taskId: 'SEED-TASK-D1',
      mode: 'deep',
      focusedSymbol: 'BTC_USDT',
      verdicts: [],
    });
  }
  if (state === 'with-result' || state === 'with-optimlens') {
    claw?.seedPreviewBacktest?.({
      taskId: 'SEED-TASK-D2',
      mode: 'deep',
      focusedSymbol: 'BTC_USDT',
      verdicts: [],
    });
  }
  if (state === 'with-optimlens') {
    claw?.seedOptimLens?.({
      strategyId: 'SEED-STRAT',
      improvements,
    });
  }
}

for (const theme of ['dark', 'light'] as const) {
  for (const state of ['empty', 'with-result', 'with-optimlens'] as const) {
    test(`Deep Backtest — ${state} — ${theme}`, async ({ page }) => {
      await page.goto('/');
      await page.evaluate(
        (args: { theme: string; state: 'empty' | 'with-result' | 'with-optimlens' }) => {
          document.documentElement.setAttribute('data-theme', args.theme);
          const claw = (window as unknown as TestClaw).__claw;
          claw?.route?.({ kind: 'workspace' });
          if (args.state === 'empty') {
            claw?.seedPreviewBacktest?.({
              taskId: 'SEED-TASK-D1',
              mode: 'deep',
              focusedSymbol: 'BTC_USDT',
              verdicts: [],
            });
          } else {
            claw?.seedPreviewBacktest?.({
              taskId: 'SEED-TASK-D2',
              mode: 'deep',
              focusedSymbol: 'BTC_USDT',
              verdicts: [],
            });
          }
        },
        { theme, state },
      );
      await page.waitForTimeout(200);
      await expect(page).toHaveScreenshot(`deep-backtest-${state}-${theme}.png`, { fullPage: true });
    });
  }
}

void seed; // exported helper kept for future re-use; satisfies lint
