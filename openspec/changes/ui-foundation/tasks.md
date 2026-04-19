## 1. Token alignment (low risk, do first — establishes visual baseline)

- [x] 1.1 Update `desktop-client/tailwind.config.js` `theme.spacing` to Pencil's scale; replace (don't extend) the default scale.
- [x] 1.2 Update `theme.borderRadius` to Pencil's `sm=6, md=8, lg=12, xl=16, full=9999`.
- [x] 1.3 Update `theme.fontFamily` to `body: ['Inter'], heading: ['Geist'], data: ['Geist Mono']`.
- [x] 1.4 Add Geist + Geist Mono font files to `desktop-client/public/fonts/` + `<link rel="preload">` in `index.html`.
- [x] 1.5 Run the app; eyeball existing pages for layout breakage. Fix any stray utility that maps to a now-non-existent value (e.g. `p-7`).
- [x] 1.6 Add ESLint rule `claw/tailwind-spacing-scale` to the existing `eslint-plugin-claw` — warns on off-scale spacing utilities.

## 2. Navigation state machine + AppRoute

- [x] 2.1 Create `src/types/navigation.ts` with the `AppRoute` discriminated union.
- [x] 2.2 Create `src/stores/workspaceStore.ts` with `mode`, `currentStrategyId`, `currentTaskId`, `focusedSymbol`, actions.
- [x] 2.3 Modify `src/stores/appStore.ts`: add `route: AppRoute` field; keep `currentTab` as a derived getter mapping `route.kind` → old string for backward compat.
- [x] 2.4 Refactor `src/App.tsx` to switch on `route.kind`. Ensure existing screens continue to render (mapping `route.kind === "screener"` → `<ScreenerPage />`, etc.).
- [x] 2.5 Update `src/components/layout/TopBar.tsx` to write route via `appStore.navigate(...)` instead of `setCurrentTab(...)`.
- [x] 2.6 Add vitest cases covering `workspaceStore` transitions + route-type narrowing.

## 3. ClawChart primitives

- [x] 3.1 Create directory `src/components/primitives/ClawChart/` with `index.ts` re-exporting the family.
- [x] 3.2 Implement `Candles.tsx`: props `{ data: Candle[], overlays?: Overlay[], markers?: Marker[], showVolume?, height, className? }`. Uses `lightweight-charts` createChart + addCandlestickSeries. Internal `useEffect` manages instance lifecycle.
- [x] 3.3 Implement theme-reactive redraw: on mount and on `MutationObserver` callback watching `<html data-theme>`, read CSS vars, call `chart.applyOptions({ layout, grid })`.
- [x] 3.4 Implement resize: `ResizeObserver` on container → `chart.resize(w, h)`.
- [x] 3.5 Implement `Mini.tsx`: props `{ data: number[], height?, color? }`. Renders a single-color line series, no axes, no crosshair.
- [x] 3.6 Implement `Equity.tsx`: props `{ data: EquityPoint[], compare?: EquityPoint[], height?, variant: "equity" | "drawdown" }`. Uses line series; drawdown variant uses area fill.
- [x] 3.7 Implement `Markers.tsx`: thin wrapper that calls `series.setMarkers(...)` — designed to be composed as a child of `Candles`.
- [x] 3.8 Unit test: snapshot the DOM structure for each variant with fixed data; assert no console errors across a 100ms window.

## 4. Watchlist + WorkspaceShell + MetricsGrid + AIPersonaShell

- [x] 4.1 `src/components/primitives/Watchlist/Watchlist.tsx`: props `{ items: WatchlistItem[], focused?, onFocus }`. Renders vertical list with `ClawChart.Mini` inline per row.
- [x] 4.2 Watchlist keyboard nav: on container focus, ↑/↓ drives `onFocus`, wraps at edges.
- [x] 4.3 `src/components/primitives/WorkspaceShell/WorkspaceShell.tsx`: slots-based layout (`topbar`, `leftRail?`, `main`, `rightRail?`). Grid / flex layout matching Pencil widths (`leftRail` 180px, `rightRail` 320-400px with collapse toggle).
- [x] 4.4 `src/components/primitives/MetricsGrid/MetricsGrid.tsx`: CSS grid auto-fit, tiles with label/value/unit/delta. `emphasis: "large"` doubles column span + font size.
- [x] 4.5 `src/components/primitives/AIPersonaShell/AIPersonaShell.tsx`: provider that accepts `persona` + `context` props and injects into a context. Children use `AIPersonaShell.Intro` / `.Transcript` / `.Composer`.
- [x] 4.6 Wire `strategist` persona: reuses current `conversationStore` + existing prompt code. Other personas are stubs that throw "not implemented" (screen changes fill them in).
- [x] 4.7 Unit tests for each primitive (render + key interaction).

## 5. Playwright visual regression harness

- [x] 5.1 Add devDep `@playwright/test` (pinned). Install Chromium only: `pnpm exec playwright install --with-deps chromium`.
- [x] 5.2 Create `desktop-client/playwright.config.ts`: `use: { viewport: { width: 1440, height: 900 }, baseURL: 'http://localhost:5173' }`. Chromium project only. `testDir: 'e2e/visual'`. `expect.toHaveScreenshot.threshold: 0.2`.
- [x] 5.3 Create `e2e/visual/setup.ts`: boots Vite dev server via `webServer` field with `VITE_USE_MOCKS=1` + `CLAW_MOCK_PROFILE=happy` + wait for idle.
- [x] 5.4 Create `e2e/visual/shell.spec.ts`: renders an ad-hoc test route that mounts `<WorkspaceShell topbar={...} main={...} rightRail={<AIPersonaShell />} />` with placeholder content; captures `shell-empty-dark` + `shell-empty-light` + `shell-with-ai-collapsed-*` snapshots.
- [x] 5.5 Add `package.json` scripts: `test:visual` = `playwright test`; `test:visual:update` = `playwright test --update-snapshots`; `test:visual:ui` = `playwright test --ui` (interactive).
- [x] 5.6 Make targets: `make test-visual` → `cd desktop-client && pnpm test:visual`. Not in `make test` (kept separate due to 30s+ warmup); added to `test-ci` later when GHA lands.
- [x] 5.7 `.gitignore` additions: `test-results/`, `playwright-report/`. Keep `e2e/visual/__screenshots__/` tracked.
- [x] 5.8 First run: `pnpm test:visual:update` to generate baselines; commit PNGs.

## 6. Pencil ↔ code alignment doc

- [x] 6.1 Create `docs/design-alignment.md` with a header and a table: `| Pencil ID | Pencil Name | Code Component | Status | Change |`.
- [x] 6.2 Populate initial rows for every primitive introduced in this change (RailRow → Watchlist, MetTile → MetricsGrid, Workspace topbars → WorkspaceShell.topbar, etc.).
- [x] 6.3 Subsequent screen changes add their rows (covered in those changes' tasks).

## 7. App.tsx routing refactor — integration

- [x] 7.1 Rewire TopBar's 3 main tabs to call `appStore.navigate({ kind: "..." })` instead of `setCurrentTab`.
- [x] 7.2 Add a "back" handler for `symbol-detail` route: sets `appStore.route = returnTo`.
- [x] 7.3 Ensure `settingsOpen` state in `App.tsx` maps to `route.kind === "settings"` rather than a local `useState` (prepares for Settings full-page in change #11).
- [x] 7.4 Verify all three existing pages (Screener / Strategies / Backtest) still render and behave identically after the refactor. Manual smoke + existing vitest covers this.

## 8. Tests

- [x] 8.1 Vitest: `stores/workspaceStore.test.ts` — transitions cover all happy paths (design → preview → deep → back).
- [x] 8.2 Vitest: `stores/appStore.test.ts` — extend to cover `navigate({ kind: ... })` and `currentTab` backward-compat alias.
- [x] 8.3 Vitest: render tests for each primitive (5 files). Smoke only — the visual spec handles pixel correctness.
- [x] 8.4 Playwright: `shell.spec.ts` captures baselines; running `pnpm test:visual` returns 0 against freshly generated baselines.

## 9. Documentation

- [x] 9.1 `desktop-client/README.md` — add a "UI primitives" section pointing at `src/components/primitives/`.
- [x] 9.2 `TESTING.md` — add "Visual regression" section: how to run, how to update baselines, how to review diffs.
- [x] 9.3 Update `CONFIGURATION.md` (from `change/desktop-client-configurable-backend`) if any new env var is added by this change.

## 10. Final validation

- [x] 10.1 `pnpm typecheck` passes.
- [x] 10.2 `pnpm lint` passes (ignore warnings from new spacing-scale rule that surface existing off-scale usages — fix opportunistically).
- [x] 10.3 `pnpm test` all green; ≥ 8 new test cases.
- [x] 10.4 `pnpm test:visual` green against committed baselines.
- [x] 10.5 `pnpm dev` → app runs; existing Screener / Strategies / Backtest pages look unchanged (or with tolerable pixel shifts from token alignment, captured in PR description).
- [x] 10.6 `pnpm dev:mock` → same, with MSW active.
- [x] 10.7 `make test` at repo root still green.
