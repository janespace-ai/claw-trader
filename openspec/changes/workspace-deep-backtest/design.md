## Context

Deep Backtest is the most information-dense screen. Three information layers coexist:
1. **Summary metrics** — 10+ numbers that characterize the strategy
2. **Time-series overlays** — equity curve + benchmark + drawdown area, potentially + monthly heatmap
3. **Actionable improvements** — OptimLens output that suggests concrete changes the user can Apply

The hard decisions are about information hierarchy (what's emphasized vs. tucked away) and Apply-flow UX.

## Goals / Non-Goals

**Goals:**
- Pixel fidelity to `QdrlI` (dark) + `TR0Ib` (light).
- Equity + benchmark + drawdown read naturally (not crowded).
- OptimLens improvements are browsable and individually Apply-able.
- Apply flow works: cards produce new strategy versions traceable in `listStrategyVersions`.

**Non-Goals:**
- Walk-forward / rolling backtests.
- Monte Carlo simulation.
- Live strategy deployment / alerts.
- Exporting to PDF.

## Decisions

### D1. Equity + benchmark + drawdown: stacked panes (not dual-axis)

**Decision.** Upper pane: equity curve + benchmark, same y-axis (both % returns from initial capital). Lower pane (30% height): drawdown area as negative values.

Rationale: dual-axis with different scales is deceiving (drawdown looks smaller than it is). Stacked panes preserve accurate visual comparison.

### D2. MetricsGrid: 5 large tiles + 6-7 small tiles

**Decision.** Top row: 5 big tiles — Total Return, Sharpe, Max Drawdown, Win Rate, Profit Factor. Secondary row: smaller tiles for Sortino, Calmar, Avg Trade, Avg Hours, Positive Days, Total Trades.

`MetricsGrid` takes `metrics[].emphasis = "large"` flag — already supported from `ui-foundation`.

### D3. OptimLens Apply flow = new strategy version (not in-place edit)

**Decision.** Clicking Apply on an improvement card:
1. Reads current strategy's latest version code
2. Applies the `suggested_change`:
   - `param_update`: replaces the param default (e.g. `self.param('fast', 10)` → `self.param('fast', 8)`)
   - `code_edit`: applies the unified diff
3. Calls `cremote.createStrategyVersion({ strategy_id, body: { code: newCode, summary: improvement.title, parent_version: currentVersion } })`
4. Transitions to Strategy Design workspace with the new version loaded; user can re-preview

No "undo" needed — each improvement is its own version in history.

### D4. Optimize modal: explicit param grid config

**Decision.** Modal shows one row per declared param in the strategy's `params_schema`. Each row:
- Checkbox: include this param in the sweep (default on)
- Current default (readonly)
- Min / Max / Step inputs, pre-filled with sensible defaults (e.g., ±50% of current)

Submit validates total combos against `PARAM_GRID_TOO_LARGE` client-side before even calling the backend (saves a round-trip).

If the strategy declares no params, show "This strategy has no tunable params — OptimLens can't help until you expose some" with a link back to Design.

### D5. MonthlyHeatmap is a new primitive

**Decision.** 12-col × N-row grid. Rows = years in the data. Cells = `{ month: "YYYY-MM", return_pct }`. Color scale: red (negative) → gray (zero) → green (positive), linear interpolation. Hover tooltip: exact pct + trade count.

Implementation: CSS grid + inline styles for colors. No charting library needed.

### D6. OptimLens is optional — degrades gracefully if backend unavailable

**Decision.** If `cremote.startOptimLens` returns 404 or `LLM_PROVIDER_FAILED`, the RightRail shows "OptimLens unavailable — showing cached/manual metrics only" banner. The rest of the screen still works — the improvement cards just don't render.

### D7. Trades tab reuses Preview's component

**Decision.** `TradesTab` is extracted from `workspace-preview-backtest` change into a shared location (`src/components/workspace/TradesTab.tsx` or similar). Import into both Preview and Deep. Saves 300+ lines of duplication.

## Risks / Trade-offs

- **[OptimLens improvement cards can be numerous]** → Cap at top 5 by default; show "show all" toggle to reveal the rest. Cards below the fold still exist, not hidden.

- **[param_update suggested_change needs to find the right line to patch]** → LLM output includes the exact param name; frontend does a regex-aware substitution (`self.param('fast', \d+)` → `self.param('fast', <new>)`) with validation. If pattern not found, Apply fails gracefully.

- **[code_edit diffs may not apply cleanly if the current version differs from the version the sweep was based on]** → Unlikely in practice (user typically runs OptimLens on the current version). If detected, show diff conflict state, offer manual merge via the Strategies page.

- **[Drawdown pane visual clutter]** → Design calls for red area fill. Limit to 30% height; hide labels below a certain resolution.

- **[MonthlyHeatmap cell size at > 24 months]** → Cells get small; tooltip becomes essential. Ship as-is; consider horizontal scroll if > 36 months.

## Migration Plan

1. Ship screen with MSW OptimLens fixtures.
2. Without real backend, Apply flow still works (creates new version in DB/MSW-mocked-store).
3. When real OptimLens ships, the screen transparently works.

## Open Questions

- Benchmark: we don't have a "market benchmark" equity curve in the contract. Pencil mock shows one. Do we fake it from BTC/ETH blend? → Punt: show only strategy equity; add benchmark later if backend produces it.
- Should Apply immediately run a new preview, or go back to Design for user confirmation? → Go back to Design. User should eyeball the diff first.
- Should improvement cards have a "dismiss" button to prune noise? → Yes; dismissed improvements kept in a collapsed "dismissed" section at bottom.
