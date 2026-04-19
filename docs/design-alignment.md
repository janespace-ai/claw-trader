# Pencil ↔ code alignment

Maps every reusable visual primitive in `design/trader.pen` to the
corresponding React component in `desktop-client/src/`. Updated as
each screen change lands.

| Pencil ID | Pencil name | Code component | Status | Change |
|---|---|---|---|---|
| `o89E6` | `ScrRow` | `Watchlist` row (`screens/ScreenerScreen` passed/failed split) | Complete | `screener-chart-first` |
| `IQK4J` | `StrategyCard` | `src/components/strategy/StrategyCard.tsx` | Complete | `strategy-management-v2` |
| `sZ3y6` | `TradeRow` | `screens/workspace/TradesTab` row | Complete | `workspace-preview-backtest` |
| `IjMN8` | `ProviderCard` | `src/components/settings/ProviderCard.tsx` | Complete | `settings-full-page` |
| `Ysu4M` | `RailRow` | `Watchlist` row (`src/components/primitives/Watchlist`) | Complete | `ui-foundation` |
| `djIo5` | `PTradeRow` | `screens/workspace/TradesTab` row (same impl as `sZ3y6`, variant via `selectedSymbol` prop) | Complete | `workspace-preview-backtest` |
| `WN8ia` | `RailRow8` | `Watchlist` row (compact variant) | Complete | `ui-foundation` |
| `Nn13b` | `MetTile` | `MetricsGrid` tile (`src/components/primitives/MetricsGrid`) | Complete | `ui-foundation` |
| `8oiDW` | `GridCell` | `src/components/workspace/CrossSymbolGrid` cell | Complete | `multi-symbol-grid` |
| — | Workspace topbar | `WorkspaceShell.topbar` slot | Complete | `ui-foundation` |
| — | Workspace leftRail | `WorkspaceShell.leftRail` slot | Complete | `ui-foundation` |
| — | Workspace main | `WorkspaceShell.main` slot | Complete | `ui-foundation` |
| — | Workspace AI panel | `AIPersonaShell` | Complete (shell + all 7 personas wired in their respective screen changes) | `ui-foundation` |
| — | Candle chart | `ClawChart.Candles` | Complete | `ui-foundation` |
| — | Mini sparkline | `ClawChart.Mini` | Complete | `ui-foundation` |
| — | Equity / drawdown curves | `ClawChart.Equity` (stacked variant for Deep) | Complete | `ui-foundation` |
| — | Strategy Design topbar | `screens/workspace/StrategyTopbar` | Complete | `workspace-strategy-design` |
| — | Strategy draft card | `screens/workspace/StrategyDraftCard` | Complete | `workspace-strategy-design` |
| — | Run Preview CTA card | `screens/workspace/RunPreviewCard` | Complete | `workspace-strategy-design` |
| `Q6cKp` / `MZuaq` | Strategy Design screen (dark / light) | `screens/workspace/StrategyDesign` | Complete | `workspace-strategy-design` |
| — | Preview Backtest topbar | `screens/workspace/PreviewTopbar` | Complete | `workspace-preview-backtest` |
| — | Signal Review verdict list | `components/chat/VerdictList` | Complete | `workspace-preview-backtest` |
| — | Quick metrics tab | `screens/workspace/QuickMetricsTab` | Complete | `workspace-preview-backtest` |
| `3PSG8` / `PISBa` | Preview Backtest screen (dark / light) | `screens/workspace/PreviewBacktest` | Complete | `workspace-preview-backtest` |
| — | Monthly returns heatmap | `components/primitives/MonthlyHeatmap` | Complete | `workspace-deep-backtest` |
| — | Deep Backtest topbar | `screens/workspace/DeepTopbar` | Complete | `workspace-deep-backtest` |
| — | OptimLens improvement card | `screens/workspace/ImprovementCard` | Complete | `workspace-deep-backtest` |
| — | OptimLens improvement list | `screens/workspace/ImprovementList` | Complete | `workspace-deep-backtest` |
| — | Optimize param-grid modal | `screens/workspace/OptimizeModal` | Complete | `workspace-deep-backtest` |
| `QdrlI` / `TR0Ib` | Deep Backtest screen (dark / light) | `screens/workspace/DeepBacktest` | Complete | `workspace-deep-backtest` |
| — | Screener topbar | `screens/screener/ScreenerTopbar` | Complete | `screener-chart-first` |
| — | Saved lists overlay | `screens/screener/SavedListsOverlay` | Complete | `screener-chart-first` |
| `bnwnL` / `iFmHp` | Screener (chart-first) screen (dark / light) | `screens/ScreenerScreen` | Complete | `screener-chart-first` |
| — | Strategy history panel | `components/strategy/StrategyHistoryPanel` | Complete | `strategy-management-v2` |
| `pGjNd` / `PLr19` | Strategy Management screen (dark / light) | `screens/StrategiesScreen` | Complete | `strategy-management-v2` |
| — | Trade Analysis card | `components/symbol/TradeAnalysisCard` | Complete | `symbol-detail` |
| `s9ooT` / `Aib9J` | Symbol Detail screen (dark / light) | `screens/SymbolDetailScreen` | Complete | `symbol-detail` |
| — | View mode switcher (Chart/Grid) | `components/workspace/ViewModeSwitcher` | Complete | `multi-symbol-grid` |
| `nvBnq` / `wBWkN` | Multi-Symbol Grid view (dark / light) | `components/workspace/CrossSymbolGrid` (rendered inside PreviewBacktest + DeepBacktest when `viewMode === 'grid'`) | Complete | `multi-symbol-grid` |
| — | Theme preview tile | `components/settings/ThemeTile` | Complete | `settings-full-page` |
| — | Remote engine status card | `screens/settings/RemoteEngineCard` | Complete | `settings-full-page` |
| `0qnH2` / `uWni9` | Settings full-page (dark / light) | `screens/SettingsScreen` | Complete | `settings-full-page` |

## Conventions

- **Every cell maps to exactly one component.** If two Pencil primitives
  collapse to the same code component, rationale is noted in the
  component's JSDoc.
- **Status values:** `Complete` (code merged + light-theme-polish
  audit ticked), `Shipped` (code merged pre-audit), `In progress` (PR
  open), `Pending` (not started).
- **Per-screen snapshots** live under
  `desktop-client/e2e/visual/__screenshots__/`. One PNG per screen per
  theme. The `light-theme-polish` change adds a `docs/theme-parity/`
  archive with Pencil ↔ code side-by-side reference images.
