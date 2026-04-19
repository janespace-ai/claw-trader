import { defineConfig, devices } from '@playwright/test';

// Visual-regression config. Drives the Vite dev server (with MSW
// enabled) rather than launching Electron directly — the renderer's
// visual layer is identical between the two contexts and skipping
// Electron saves ~3s per test boot and avoids native-module churn.
//
// Runs:
//   pnpm test:visual          → run + diff against committed baselines
//   pnpm test:visual:update   → overwrite baselines (intentional changes)
//   pnpm test:visual:ui       → interactive reviewer
export default defineConfig({
  testDir: 'e2e/visual',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  expect: {
    toHaveScreenshot: {
      // Tolerate minor sub-pixel + font-rendering jitter.
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
    },
  },
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    // Inject a stable timezone / locale so snapshots don't flap on CI.
    timezoneId: 'UTC',
    locale: 'en-US',
  },
  projects: [
    {
      name: 'chromium-dark',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        // Theme is set inside the spec before the screenshot.
      },
    },
  ],
  webServer: {
    command: 'VITE_USE_MOCKS=1 CLAW_BROWSER_ONLY=1 vite --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { CLAW_MOCK_PROFILE: 'happy' },
  },
});
