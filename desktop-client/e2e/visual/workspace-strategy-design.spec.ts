import { test, expect } from '@playwright/test';

// Visual regression for the Strategy Design workspace screen.
// Pencil frames: `Q6cKp` (dark) / `MZuaq` (light).
//
// Two states per theme:
//   empty      — no strategist draft yet (left card is empty-state)
//   with-draft — a summary + code has been injected via test hook
//
// The "with-draft" case uses the exposed `__claw.seedStrategistDraft` test
// hook (see `StrategyDesign.tsx`) rather than driving the AI panel so
// visual baselines are deterministic.

test.describe('Strategy Design — empty state', () => {
  test('dark theme', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      // Force workspace/design route for the screenshot.
      (window as unknown as { __claw?: { route: (r: unknown) => void } }).__claw?.route?.({ kind: 'workspace' });
    });
    await page.waitForTimeout(150);
    await expect(page).toHaveScreenshot('strategy-design-empty-dark.png', { fullPage: true });
  });

  test('light theme', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      (window as unknown as { __claw?: { route: (r: unknown) => void } }).__claw?.route?.({ kind: 'workspace' });
    });
    await page.waitForTimeout(150);
    await expect(page).toHaveScreenshot('strategy-design-empty-light.png', { fullPage: true });
  });
});

test.describe('Strategy Design — with draft', () => {
  const seedDraft = () => {
    (window as unknown as {
      __claw?: {
        seedStrategistDraft?: (draft: unknown) => void;
        route?: (r: unknown) => void;
      };
    }).__claw?.seedStrategistDraft?.({
      summary: {
        name: 'BTC Momentum',
        interval: '1h',
        longCondition: 'close > ema(close, 50)',
        params: { ema_fast: 20, ema_slow: 50 },
      },
      code: 'def strategy(ctx):\n    return ctx.close > ctx.ema(50)\n',
    });
    (window as unknown as { __claw?: { route?: (r: unknown) => void } }).__claw?.route?.({ kind: 'workspace' });
  };

  test('dark theme', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.evaluate(seedDraft);
    await page.waitForTimeout(150);
    await expect(page).toHaveScreenshot('strategy-design-with-draft-dark.png', { fullPage: true });
  });

  test('light theme', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.evaluate(seedDraft);
    await page.waitForTimeout(150);
    await expect(page).toHaveScreenshot('strategy-design-with-draft-light.png', { fullPage: true });
  });
});
