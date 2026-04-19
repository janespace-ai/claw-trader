## 1. Prereqs

- [x] 1.1 `ui-foundation`, `workspace-preview-backtest`, `workspace-deep-backtest` landed.

## 2. workspaceStore extension

- [x] 2.1 Add `viewMode: "chart" | "grid"` + `setViewMode(mode)` action.
- [x] 2.2 Initialize from `localStorage.getItem("workspace.viewMode")`.
- [x] 2.3 `setViewMode` writes to localStorage.
- [x] 2.4 Vitest for the store.

## 3. CrossSymbolGrid component

- [x] 3.1 Create `src/components/workspace/CrossSymbolGrid.tsx`.
- [x] 3.2 Responsive grid: determine dimensions by `symbols.length` + viewport width.
- [x] 3.3 Cell: header (symbol + return%), body (`ClawChart.Mini` of equity_curve), click handlers.
- [x] 3.4 Sort-by dropdown at top.
- [x] 3.5 Unit test: renders N cells for N symbols.

## 4. ViewModeSwitcher component

- [x] 4.1 Create `src/components/workspace/ViewModeSwitcher.tsx`. Two chip buttons with highlight state.
- [x] 4.2 Place in Preview topbar (right side).
- [x] 4.3 Place in Deep topbar (right side, same component).

## 5. Screen integration

- [x] 5.1 PreviewBacktest: main area conditionally renders `<MainChart />` or `<CrossSymbolGrid />`.
- [x] 5.2 DeepBacktest: same.
- [x] 5.3 Verify tabs below remain visible in grid mode too.

## 6. Click-to-drill

- [x] 6.1 Single-click cell: `workspaceStore.focusedSymbol = sym; setViewMode("chart")`.
- [x] 6.2 Double-click cell: `navigate({ kind: "symbol-detail", symbol: sym, returnTo: <current>, backtestTaskId })`.

## 7. Tests

- [x] 7.1 `e2e/visual/multi-symbol-grid.spec.ts` with 3 baselines.
- [x] 7.2 Vitest: CrossSymbolGrid render + click + sort.
- [x] 7.3 Vitest: workspaceStore viewMode.

## 8. Documentation

- [x] 8.1 `docs/design-alignment.md` — `GridCell` Pencil primitive → CrossSymbolGrid cell, `ViewModeSwitcher` mapping.

## 9. Final validation

- [x] 9.1 All tests green.
- [x] 9.2 Manual: from Preview, click Grid, see 9 cells; click one cell → back to chart with that symbol focused; double-click → Symbol Detail.
- [x] 9.3 View-mode preference persists after refresh.
