# Pencil ↔ code alignment

Maps every reusable visual primitive in `design/trader.pen` to the
corresponding React component in `desktop-client/src/`. Updated as
each screen change lands.

| Pencil ID | Pencil name | Code component | Status | Change |
|---|---|---|---|---|
| `o89E6` | `ScrRow` | TBD (Watchlist row variant) | Pending | `screener-chart-first` |
| `IQK4J` | `StrategyCard` | TBD (`src/components/strategy/StrategyCard.tsx`) | Pending | `strategy-management-v2` |
| `sZ3y6` | `TradeRow` | `screens/workspace/TradesTab` row | Shipped | `workspace-preview-backtest` |
| `IjMN8` | `ProviderCard` | TBD (`src/components/settings/ProviderCard.tsx`) | Pending | `settings-full-page` |
| `Ysu4M` | `RailRow` | `Watchlist` row (`src/components/primitives/Watchlist`) | Shipped | `ui-foundation` |
| `djIo5` | `PTradeRow` | `screens/workspace/TradesTab` row (same impl as `sZ3y6`, variant via `selectedSymbol` prop) | Shipped | `workspace-preview-backtest` |
| `WN8ia` | `RailRow8` | `Watchlist` row (compact variant) | Shipped | `ui-foundation` |
| `Nn13b` | `MetTile` | `MetricsGrid` tile (`src/components/primitives/MetricsGrid`) | Shipped | `ui-foundation` |
| `8oiDW` | `GridCell` | TBD (`src/components/workspace/CrossSymbolGrid` cell) | Pending | `multi-symbol-grid` |
| — | Workspace topbar | `WorkspaceShell.topbar` slot | Shipped | `ui-foundation` |
| — | Workspace leftRail | `WorkspaceShell.leftRail` slot | Shipped | `ui-foundation` |
| — | Workspace main | `WorkspaceShell.main` slot | Shipped | `ui-foundation` |
| — | Workspace AI panel | `AIPersonaShell` | Shipped (shell only; per-persona prompts land with each screen) | `ui-foundation` |
| — | Candle chart | `ClawChart.Candles` | Shipped | `ui-foundation` |
| — | Mini sparkline | `ClawChart.Mini` | Shipped | `ui-foundation` |
| — | Equity / drawdown curves | `ClawChart.Equity` (stacked variant for Deep) | Shipped | `ui-foundation` |
| — | Strategy Design topbar | `screens/workspace/StrategyTopbar` | Shipped | `workspace-strategy-design` |
| — | Strategy draft card | `screens/workspace/StrategyDraftCard` | Shipped | `workspace-strategy-design` |
| — | Run Preview CTA card | `screens/workspace/RunPreviewCard` | Shipped | `workspace-strategy-design` |
| `Q6cKp` / `MZuaq` | Strategy Design screen (dark / light) | `screens/workspace/StrategyDesign` | Shipped | `workspace-strategy-design` |
| — | Preview Backtest topbar | `screens/workspace/PreviewTopbar` | Shipped | `workspace-preview-backtest` |
| — | Signal Review verdict list | `components/chat/VerdictList` | Shipped | `workspace-preview-backtest` |
| — | Quick metrics tab | `screens/workspace/QuickMetricsTab` | Shipped | `workspace-preview-backtest` |
| `3PSG8` / `PISBa` | Preview Backtest screen (dark / light) | `screens/workspace/PreviewBacktest` | Shipped | `workspace-preview-backtest` |
| — | Monthly returns heatmap | `components/primitives/MonthlyHeatmap` | Shipped | `workspace-deep-backtest` |
| — | Deep Backtest topbar | `screens/workspace/DeepTopbar` | Shipped | `workspace-deep-backtest` |
| — | OptimLens improvement card | `screens/workspace/ImprovementCard` | Shipped | `workspace-deep-backtest` |
| — | OptimLens improvement list | `screens/workspace/ImprovementList` | Shipped | `workspace-deep-backtest` |
| — | Optimize param-grid modal | `screens/workspace/OptimizeModal` | Shipped | `workspace-deep-backtest` |
| `QdrlI` / `TR0Ib` | Deep Backtest screen (dark / light) | `screens/workspace/DeepBacktest` | Shipped | `workspace-deep-backtest` |

## Conventions

- **Every cell maps to exactly one component.** If two Pencil primitives
  collapse to the same code component, rationale is noted in the
  component's JSDoc.
- **Status values:** `Shipped` (code merged), `In progress` (PR open),
  `Pending` (not started).
- **Per-screen snapshots** live under
  `desktop-client/e2e/visual/__screenshots__/`. One PNG per screen per
  theme. The `light-theme-polish` change adds a `docs/theme-parity/`
  archive with Pencil ↔ code side-by-side reference images.
