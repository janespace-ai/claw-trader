## Context

The grid view is an **alternative rendering** of the same backtest result. It reuses the same data that Preview/Deep already loads (`per_symbol`). Visually it's very different from the single-chart view, but it doesn't call any new endpoints.

Pencil uses the view-switcher design pattern: two small chip-buttons in the topbar toggle between "Chart" and "Grid" modes.

## Goals / Non-Goals

**Goals:**
- Pixel fidelity to `nvBnq` / `wBWkN`.
- Grid adapts to symbol count.
- Clicking a cell returns to Chart mode with that symbol focused (natural drill-in).
- View preference persists across Preview/Deep.

**Non-Goals:**
- New data fetching.
- Custom cell sizing.
- Comparison grids (same symbol across different strategies).

## Decisions

### D1. Grid is a main-area view mode, not a separate route

**Decision.** `workspaceStore.viewMode: "chart" | "grid"`. The Workspace screen's main area conditionally renders `<MainChart />` or `<CrossSymbolGrid />` based on this.

Why not a route? Because the rightRail (AI persona), topbar, leftRail (Watchlist) all stay the same. It's not a context change, it's a content switch.

### D2. Grid dimensions adapt to count

**Decision.** Rules:
- 1-4 symbols: 2×2
- 5-9 symbols: 3×3
- 10-16 symbols: 4×4
- 17+ symbols: 4×4 with overflow scrolling

Pencil mock shows 3×3 = 9 cells. Common case.

### D3. Cell click = drill to Chart mode, NOT to Symbol Detail

**Decision.** Click a grid cell → `workspaceStore.focusedSymbol = sym; setViewMode("chart")`. User lands on the Chart view with that symbol's chart front-and-center.

Double-click (or explicit "Open" button in cell header) → navigate to Symbol Detail screen.

Rationale: single-click is the light drill-down (common); double-click is the heavier drill-down (rare).

### D4. View mode persists in localStorage

**Decision.** `workspaceStore.viewMode` subscribes to `localStorage` key `workspace.viewMode`. User's last choice sticks across sessions.

## Risks / Trade-offs

- **[ClawChart.Mini × 16 render cost]** → `ClawChart.Mini` is lightweight (no crosshair, no tooltip). 16 instances should render in <100ms. Measure; optimize if needed (e.g. canvas reuse).

- **[Grid layout on narrow windows]** → At <1000px width, fall back to 2×2 regardless of count; let users scroll vertically.

- **[Per-cell metric shown = return pct — what about Sharpe etc.?]** → Out of scope. Grid is "at-a-glance equity shape"; detailed metrics on the per-symbol MetricsTab.

## Migration Plan

1. Ship view-switcher in Preview + Deep simultaneously (small change in each).
2. CrossSymbolGrid shared component.

## Open Questions

- Should the grid offer a "sort by" dropdown (best-to-worst, alphabetical)? → Yes, dropdown in top-right of grid. Default: best-to-worst (by return desc).
- Should cells show a mini benchmark comparison (strategy vs benchmark in one chart)? → No. Too busy at small size. Keep single line.
