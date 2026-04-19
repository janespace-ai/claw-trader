## 1. Prereqs

- [ ] 1.1 `ui-foundation`, `workspace-preview-backtest`, `workspace-deep-backtest` landed.

## 2. workspaceStore extension

- [ ] 2.1 Add `viewMode: "chart" | "grid"` + `setViewMode(mode)` action.
- [ ] 2.2 Initialize from `localStorage.getItem("workspace.viewMode")`.
- [ ] 2.3 `setViewMode` writes to localStorage.
- [ ] 2.4 Vitest for the store.

## 3. CrossSymbolGrid component

- [ ] 3.1 Create `src/components/workspace/CrossSymbolGrid.tsx`.
- [ ] 3.2 Responsive grid: determine dimensions by `symbols.length` + viewport width.
- [ ] 3.3 Cell: header (symbol + return%), body (`ClawChart.Mini` of equity_curve), click handlers.
- [ ] 3.4 Sort-by dropdown at top.
- [ ] 3.5 Unit test: renders N cells for N symbols.

## 4. ViewModeSwitcher component

- [ ] 4.1 Create `src/components/workspace/ViewModeSwitcher.tsx`. Two chip buttons with highlight state.
- [ ] 4.2 Place in Preview topbar (right side).
- [ ] 4.3 Place in Deep topbar (right side, same component).

## 5. Screen integration

- [ ] 5.1 PreviewBacktest: main area conditionally renders `<MainChart />` or `<CrossSymbolGrid />`.
- [ ] 5.2 DeepBacktest: same.
- [ ] 5.3 Verify tabs below remain visible in grid mode too.

## 6. Click-to-drill

- [ ] 6.1 Single-click cell: `workspaceStore.focusedSymbol = sym; setViewMode("chart")`.
- [ ] 6.2 Double-click cell: `navigate({ kind: "symbol-detail", symbol: sym, returnTo: <current>, backtestTaskId })`.

## 7. Tests

- [ ] 7.1 `e2e/visual/multi-symbol-grid.spec.ts` with 3 baselines.
- [ ] 7.2 Vitest: CrossSymbolGrid render + click + sort.
- [ ] 7.3 Vitest: workspaceStore viewMode.

## 8. Documentation

- [ ] 8.1 `docs/design-alignment.md` — `GridCell` Pencil primitive → CrossSymbolGrid cell, `ViewModeSwitcher` mapping.

## 9. Final validation

- [ ] 9.1 All tests green.
- [ ] 9.2 Manual: from Preview, click Grid, see 9 cells; click one cell → back to chart with that symbol focused; double-click → Symbol Detail.
- [ ] 9.3 View-mode preference persists after refresh.
