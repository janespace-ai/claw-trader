## Why

Pencil frame `s9ooT` (`Screen / Symbol Detail`) + `Aib9J` (Light) is the **drill-down** view a user reaches from a trade row in Preview/Deep Backtest, from a card in Strategy Management, or from Symbol metadata cells anywhere. Today a `SymbolDetailPage.tsx` file exists in code but is **not wired to any route**.

This change wires it up, rebuilds the screen pixel-level, and wires the **Trade Analysis** AI persona that explains individual trades in natural language.

## What Changes

**Screen rebuild** (`src/screens/SymbolDetailScreen.tsx`) — replaces orphaned `src/pages/SymbolDetailPage.tsx`:
- Topbar: "Back to summary" link + symbol name + metadata chips (last price / 24h change / rank)
- Main:
  - "Price & Signals" section: `ClawChart.Candles` + trade markers for this symbol
  - "Trade Journal" table (virtualized): each row a trade, click → select → Trade Analysis AI
  - Right side of Journal: mini charts — "Symbol Equity" (+ return) + "Drawdown" (red area)
- RightRail: `AIPersonaShell persona="trade-analysis"` — auto-generates narrative for selected trade via `cremote.explainTrade`

**Trade Analysis persona**:
- Composer **disabled** (read-only persona)
- On trade row click: auto-fires `cremote.explainTrade({ backtest_task_id, symbol, trade_id })`
- Returns `TradeExplainResult` with `narrative`, `entry_context.indicators`, `exit_context.reason`
- Rendered as structured card: narrative text + indicators table + exit reason pill

**Routing**:
- `route.kind === "symbol-detail"` with `{ symbol, returnTo }` enters the screen
- "Back" button sets `appStore.route = returnTo`
- Entry points wired in this change:
  - Preview Backtest trade row → navigate with `returnTo: { kind: "workspace", ... }`
  - Deep Backtest trade row → same
  - Strategy Management card with a focused symbol — nope, cards don't drill down to symbol directly
  - (Future: Screener LeftRail row double-click)

**Backend calls**:
- `cremote.getSymbolMetadata(symbol)` — header chips
- `cremote.getKlines(...)` — chart data
- `cremote.getBacktestResult(taskId)` — to locate the strategy context (which trades happened for this symbol)
- `cremote.explainTrade(...)` — per-trade narrative

## Capabilities

### New Capabilities
- `ui-symbol-detail`: Symbol drill-down screen, Trade Analysis persona, trade journal virtualization, entry points wired from Preview/Deep.

### Modified Capabilities
- `ui-workspace-preview-backtest`: trade row click now navigates to Symbol Detail.
- `ui-workspace-deep-backtest`: trade row click now navigates to Symbol Detail.

## Impact

**New files**
- `src/screens/SymbolDetailScreen.tsx` + sub-components (`SymbolTopbar`, `TradeJournal`, `TradeAnalysisCard`)
- `src/services/prompt/personas/tradeAnalysis.ts`
- `e2e/visual/symbol-detail.spec.ts`

**Modified files**
- `src/App.tsx` — `route.kind === "symbol-detail"` → `<SymbolDetailScreen />`
- `src/components/workspace/TradesTab.tsx` (if shared) — row click handler navigates to symbol detail
- `src/components/primitives/AIPersonaShell/personas.ts` — register `trade-analysis`
- `docs/design-alignment.md` — Symbol Detail topbar, TradeJournal

**Deleted files**
- `src/pages/SymbolDetailPage.tsx` — the orphaned file, replaced

**Depends on**
- `ui-foundation` (workspaceShell, ClawChart primitives, AIPersonaShell)
- `api-contract-new-capabilities` — `cremote.getSymbolMetadata`, `explainTrade`, extended `getBacktestResult`
- `workspace-preview-backtest` / `workspace-deep-backtest` — for entry point wiring

**Out of scope**
- Saving trade analysis to DB for later review.
- Bulk trade annotation.
- Symbol comparison (side-by-side different symbols).
