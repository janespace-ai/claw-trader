## 1. Prereqs

- [x] 1.1 Verify `ui-foundation`, `workspace-strategy-design`, `workspace-preview-backtest`, `api-contract-new-capabilities` have all landed.
- [x] 1.2 Confirm `cremote.startOptimLens`, `getOptimLensResult`, `createStrategyVersion`, extended `getBacktestResult` are typed.

## 2. Primitive extensions

- [x] 2.1 Create `src/components/primitives/MonthlyHeatmap/MonthlyHeatmap.tsx`. CSS grid 12-col × N-row. Color scale per D5.
- [x] 2.2 Extend `ClawChart.Equity` with `variant: "stacked"` + `showDrawdown` + `compare` props. Implement via two lightweight-charts instances with synced time scales (listen to `timeScale().subscribeVisibleTimeRangeChange` and mirror).
- [x] 2.3 Unit tests for both primitives.

## 3. OptimLens persona

- [x] 3.1 `src/services/prompt/personas/optimlens.ts` — prompt for user follow-up questions. Does NOT generate improvements (backend does).
- [x] 3.2 Register in `AIPersonaShell.personas`.
- [x] 3.3 `ImprovementCard.tsx` — renders one OptimLensImprovement with Apply + Dismiss buttons.
- [x] 3.4 `ImprovementList.tsx` — orders cards, handles dismissed-section collapse.
- [x] 3.5 Store: `src/stores/optimlensStore.ts` — one active run per strategy, tracks taskId, progress, improvements, dismissed ids.

## 4. Apply flow

- [x] 4.1 `src/services/strategyPatcher.ts`:
  - `applyParamUpdate(code, { param_name, current, suggested }): string` — regex-based, raises on pattern miss
  - `applyCodeEdit(code, diff): string` — naïve unified-diff applier; raises on conflict
- [x] 4.2 Unit tests for both patchers (param happy, param pattern miss, diff happy, diff conflict).
- [x] 4.3 Apply button handler in `ImprovementCard`:
  - Fetch current version code via `cremote.getStrategy`
  - Patch
  - Call `cremote.createStrategyVersion`
  - `workspaceStore.enterDesign(strategy_id)`
  - Toast "Version N created — review in Design"

## 5. Screen component

- [x] 5.1 `src/screens/workspace/DeepBacktest.tsx` — assembles WorkspaceShell + subcomponents.
- [x] 5.2 `DeepTopbar.tsx` — summary line + Optimize CTA.
- [x] 5.3 Top MetricsGrid setup: 5 large + 6-7 small tiles from `summary.metrics`.
- [x] 5.4 Main chart: `ClawChart.Equity variant="stacked"` with `data=summary.equity_curve`, `compare=benchmark?`, `drawdown=summary.drawdown_curve`.
- [x] 5.5 LeftRail: reuse `Watchlist` (may need an empty state for pre-load).
- [x] 5.6 Bottom tabs: `Metrics | Trades | Monthly`. Import `TradesTab` from shared location (refactor out of Preview if not yet shared).
- [x] 5.7 `MetricsTab.tsx`: detailed breakdown tables (e.g. trade duration histogram, per-symbol summary).
- [x] 5.8 `MonthlyTab.tsx`: wraps `MonthlyHeatmap` with year-label column.
- [x] 5.9 RightRail: `AIPersonaShell persona="optimlens"` with ImprovementList overlay.

## 6. Optimize modal

- [x] 6.1 `OptimizeModal.tsx` — reads current strategy's `params_schema`, renders per-param rows with min/max/step defaults.
- [x] 6.2 Live combo-count calculation with `PARAM_GRID_TOO_LARGE` client-side cap.
- [x] 6.3 Submit handler → `cremote.startOptimLens` → kicks polling via `optimlensStore`.
- [x] 6.4 "No tunable params" empty state.

## 7. Cross-screen: extract TradesTab to shared

- [x] 7.1 Move `workspace-preview-backtest`'s `TradesTab.tsx` to `src/components/workspace/TradesTab.tsx`. Update Preview to import from there.
- [x] 7.2 Deep imports the same component.

## 8. Route wiring

- [x] 8.1 In `App.tsx`, replace the "Deep workspace coming in change #6" placeholder with `<DeepBacktest />` for `workspaceStore.mode === "deep"`.
- [x] 8.2 `DeepBacktest` fetches the result via `cremote.getBacktestResult(workspaceStore.currentTaskId)`, polls while pending.

## 9. Tests

- [x] 9.1 Visual regression spec `e2e/visual/workspace-deep-backtest.spec.ts` with 6 baselines per Requirement 7.
- [x] 9.2 Vitest: screen render with seeded done result; verify MetricsGrid values + chart renders.
- [x] 9.3 Vitest: `optimlensStore.test.ts` — start → running → done flow with mocked cremote.
- [x] 9.4 Vitest: `strategyPatcher.test.ts` — 4+ cases each path.
- [x] 9.5 Vitest: `MonthlyHeatmap.test.tsx` — render + hover tooltip.

## 10. Documentation

- [x] 10.1 `docs/design-alignment.md` — rows for `ImprovementCard`, `OptimizeModal`, `MonthlyHeatmap`, `DeepTopbar`.

## 11. Final validation

- [x] 11.1 All tests green.
- [x] 11.2 Manual: Design → Preview → Confirm → Deep end-to-end against MSW. Optimize → Apply one improvement → verify returns to Design with new version selected.
- [x] 11.3 Against real backend: screen renders metrics; OptimLens shows "unavailable" banner (expected until backend change ships).
