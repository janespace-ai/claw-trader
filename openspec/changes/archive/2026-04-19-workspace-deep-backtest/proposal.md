## Why

Pencil frame `QdrlI` (`Screen / Workspace - Deep Backtest`) + `TR0Ib` (Light) is the final step of the Workspace flow: after Preview says "looks promising", Deep runs the strategy over 180+ days and produces the full metrics grid, monthly heatmap, equity+drawdown overlay, and — critically — **OptimLens**, the AI persona that synthesizes concrete parameter improvements from a server-side param sweep.

## What Changes

**New screen** (`src/screens/workspace/DeepBacktest.tsx`):
- `WorkspaceShell` layout:
  - Topbar: strategy + "Deep backtest complete — 45% return over 180d" summary + `Optimize` CTA
  - LeftRail: per-symbol watchlist with return + sparkline (same primitive as Preview)
  - Main area:
    - Big `ClawChart.Equity` with two overlaid series: strategy equity (purple) + benchmark (yellow) + drawdown area (muted red underneath)
    - Below: `MetricsGrid` of 10-12 tiles (Total Return / Sharpe / Sortino / Calmar / Profit Factor / Win Rate / Avg Trade / Avg Hours In Trade / Positive Days / Max Drawdown / Total Trades)
    - Bottom tabs: `Metrics | Trades | Monthly`
      - Metrics: detailed breakdown tables
      - Trades: virtualized trades table (reuse Preview's `TradesTab`)
      - Monthly: heatmap of monthly returns (reuse `ClawChart.Equity` monthly variant OR a dedicated heatmap component)
  - RightRail: `AIPersonaShell persona="optimlens"`

**OptimLens AI persona**:
- System prompt for the **chat** portion (`src/services/prompt/personas/optimlens.ts`). Real improvement generation happens server-side via `cremote.startOptimLens`; the prompt here helps the user ask follow-ups ("why would tighter stops help?").
- Structured improvement cards: each `OptimLensImprovement` renders as a card with:
  - Title + category pill (entry / exit / params / filter / risk_mgmt)
  - `rationale` (2-3 sentences)
  - `expected_delta` triple: Sharpe, Max DD, Win Rate, colored green/red
  - `suggested_change` — if `kind: "param_update"`, show before/after; if `kind: "code_edit"`, show a collapsible diff
- `Apply` button per card → writes the suggested change into the strategy's next version (via `cremote.createStrategyVersion`) and returns the user to Strategy Design for re-preview

**Optimize CTA**:
- Topbar button click → shows a modal asking "which params to sweep?" with checkboxes of each declared `params` key, min/max/step defaults filled in
- Submit → `cremote.startOptimLens({ strategy_id, symbols, param_grid, lookback_days })`
- Transitions to an "optimizing" state showing progress phases (`sweep` done X/Y, `synthesize` running)
- On completion, RightRail transcript populates with improvement cards

**Monthly returns heatmap**:
- New component `src/components/primitives/MonthlyHeatmap.tsx` — 12-column × N-row grid of colored cells, value + color from `summary.monthly_returns`
- Hover shows exact return pct and trade count

**Equity + drawdown overlay**:
- Single chart, two y-axes (equity left, drawdown right) OR stacked panes (preferred for clarity)
- Chart component: `ClawChart.Equity` variant `dual-axis` OR `stacked`

## Capabilities

### New Capabilities
- `ui-workspace-deep-backtest`: The Deep Backtest screen, OptimLens persona, Optimize param-selection modal, monthly heatmap component, Apply flow for suggested improvements.

### Modified Capabilities
- `ui-foundation`: Adds `MonthlyHeatmap` primitive, extends `ClawChart.Equity` with stacked drawdown pane capability.

## Impact

**New files**
- `src/screens/workspace/DeepBacktest.tsx` + sub-components (`DeepTopbar`, `OptimizeModal`, `ImprovementCard`, `MetricsTab`, `MonthlyTab`)
- `src/components/primitives/MonthlyHeatmap/MonthlyHeatmap.tsx`
- `src/services/prompt/personas/optimlens.ts`
- `e2e/visual/workspace-deep-backtest.spec.ts`

**Modified files**
- `src/App.tsx` — renders `<DeepBacktest />` when `mode === "deep"`
- `src/components/primitives/ClawChart/Equity.tsx` — add `showDrawdown` prop, second pane or area fill
- `src/components/primitives/AIPersonaShell/personas.ts` — register `optimlens`
- `docs/design-alignment.md`

**Depends on**
- `ui-foundation` (primitives + route)
- `workspace-strategy-design` + `workspace-preview-backtest` (for mode transitions)
- `api-contract-new-capabilities` — `cremote.startOptimLens`, `cremote.getOptimLensResult`, `cremote.createStrategyVersion`, extended `cremote.getBacktestResult` with per_symbol + monthly_returns

**Out of scope**
- Real OptimLens backend (the LLM + param sweep impl) — tracked as backend change `backtest-engine-analysis-endpoints`. MSW provides fixture improvements for UI work.
- Walk-forward / Monte Carlo modes (not in Pencil).
- Exporting a PDF report.
