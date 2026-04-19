## Why

Pencil frame `nvBnq` (`Screen / Multi-Symbol Grid`) + `wBWkN` (Light) provides a "cross-symbol overview" view: 3×3 grid of mini equity charts, each showing one symbol's backtest equity curve. Complements the per-symbol drill-down by giving the user a bird's-eye view of which symbols work for the current strategy.

This is a **view-mode toggle** inside the Workspace (either Preview or Deep), not a standalone route. Pencil shows it as an alternative rendering of the workspace main area.

## What Changes

**New view mode** — grid layout in place of the single-chart main area:
- Accessible via a view-switcher in the Workspace topbar: `[Chart] [Grid]` chips (Pencil `tb9` has this)
- When `Grid` active, main area renders a 3×3 grid of `ClawChart.Mini` cells
- Each cell:
  - Symbol code (top-left)
  - Return pct (top-right, colored)
  - Mini equity curve
  - Click cell → `workspaceStore.focusedSymbol` + switch back to `Chart` view
- Grid adapts: 2×2 if < 5 symbols, 3×3 if 5-12, 4×4 if more

**New component** `src/components/workspace/CrossSymbolGrid.tsx`:
- Takes `per_symbol` as prop
- Renders responsive grid
- Each cell wraps `ClawChart.Mini` with header + return overlay

**View-mode store**:
- Add `viewMode: "chart" | "grid"` to `workspaceStore`
- Persists across Preview/Deep transitions (user preference)

## Capabilities

### New Capabilities
- `ui-multi-symbol-grid`: The grid view mode, view-switcher integration into workspace topbars, CrossSymbolGrid component.

### Modified Capabilities
- `ui-workspace-preview-backtest`: Topbar gets view-switcher; main area switches between chart and grid based on `workspaceStore.viewMode`.
- `ui-workspace-deep-backtest`: Same.

## Impact

**New files**
- `src/components/workspace/CrossSymbolGrid.tsx`
- `src/components/workspace/ViewModeSwitcher.tsx`
- `e2e/visual/multi-symbol-grid.spec.ts`

**Modified files**
- `src/screens/workspace/PreviewBacktest.tsx` — main area conditional on viewMode
- `src/screens/workspace/DeepBacktest.tsx` — same
- `src/stores/workspaceStore.ts` — add `viewMode`, `setViewMode`
- `docs/design-alignment.md` — GridCell Pencil primitive → CrossSymbolGrid cell

**Depends on**
- `ui-foundation` (ClawChart.Mini)
- `workspace-preview-backtest` + `workspace-deep-backtest` (for the topbar integration)

**Out of scope**
- Custom grid sizes beyond 2×2 / 3×3 / 4×4.
- Multi-metric grid (each cell showing different metric).
- Drag-reorder cells.
- Comparing different strategies in the grid (scope is one strategy × multiple symbols).
