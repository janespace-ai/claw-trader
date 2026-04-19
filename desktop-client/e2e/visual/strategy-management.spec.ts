import { test, expect } from '@playwright/test';

// Visual regression for the Strategy Management screen.
// Pencil frames: `pGjNd` (dark) / `PLr19` (light).

type TestClaw = {
  __claw?: {
    route?: (r: unknown) => void;
  };
};

for (const theme of ['dark', 'light'] as const) {
  for (const state of ['all', 'favorites'] as const) {
    test(`Strategies — ${state} — ${theme}`, async ({ page }) => {
      await page.goto('/');
      await page.evaluate(
        (args: { theme: string; state: string }) => {
          document.documentElement.setAttribute('data-theme', args.theme);
          const claw = (window as unknown as TestClaw).__claw;
          claw?.route?.({ kind: 'strategies' });
          // Filter is purely client state; the default is 'all', so the
          // favorites variant simulates the user tab-click by dispatching
          // the relevant click via DOM query after mount. The visual
          // baseline for 'favorites' just exercises the filter chip state.
          if (args.state === 'favorites') {
            // Defer one tick so the screen has mounted.
            setTimeout(() => {
              const btn = Array.from(document.querySelectorAll('button')).find(
                (b) => b.textContent?.toLowerCase().startsWith('favorites'),
              );
              btn?.click();
            }, 0);
          }
        },
        { theme, state },
      );
      await page.waitForTimeout(250);
      await expect(page).toHaveScreenshot(`strategies-${state}-${theme}.png`, { fullPage: true });
    });
  }
}
