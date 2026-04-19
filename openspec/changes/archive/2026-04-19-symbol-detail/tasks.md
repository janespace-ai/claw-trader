## 1. Prereqs

- [x] 1.1 `ui-foundation`, `workspace-preview-backtest`, `workspace-deep-backtest` landed.
- [x] 1.2 `api-contract-new-capabilities` — `cremote.getSymbolMetadata`, `explainTrade` available.

## 2. Clean up orphaned code

- [x] 2.1 Delete `src/pages/SymbolDetailPage.tsx` (orphaned, not referenced).

## 3. Trade Analysis persona

- [x] 3.1 `src/services/prompt/personas/tradeAnalysis.ts` — minimal (Composer disabled; persona is a presenter).
- [x] 3.2 Register in `AIPersonaShell.personas`.

## 4. Store additions

- [x] 4.1 Extend `workspaceStore` with `focusedTradeId: string | null` + `focusTrade(id)` action.
- [x] 4.2 `src/stores/tradeAnalysisStore.ts` — cache of `trade_id → TradeExplainResult`, `loadForTrade(...)` action that either returns cached or calls `cremote.explainTrade`.

## 5. Screen

- [x] 5.1 `src/screens/SymbolDetailScreen.tsx` — main component.
- [x] 5.2 `SymbolTopbar.tsx` — Back link + metadata chips.
- [x] 5.3 Fetch `cremote.getSymbolMetadata(symbol)` + `cremote.getBacktestResult(backtestTaskId?)` on mount.
- [x] 5.4 Main chart: `ClawChart.Candles` + `ClawChart.Markers` for this symbol's trades.
- [x] 5.5 `TradeJournal.tsx` — virtualized table (reuse `TradesTab` logic, filter to this symbol).
- [x] 5.6 Right-of-journal mini charts: `SymbolEquityCard.tsx` + `SymbolDrawdownCard.tsx`.
- [x] 5.7 RightRail: `<AIPersonaShell persona="trade-analysis" context={{ focusedTradeId }} />`.

## 6. Trade Analysis card renderer

- [x] 6.1 `TradeAnalysisCard.tsx` — renders the `TradeExplainResult`: narrative (paragraph), indicators table, regime pill, exit reason pill.
- [x] 6.2 Replaces generic chat bubbles in the `trade-analysis` persona's Transcript.
- [x] 6.3 Error + retry state.
- [x] 6.4 Loading skeleton.

## 7. Navigation wiring

- [x] 7.1 `App.tsx`: `route.kind === "symbol-detail"` → `<SymbolDetailScreen symbol={route.symbol} returnTo={route.returnTo} backtestTaskId={route.backtestTaskId} />`.
- [x] 7.2 Modify Preview's `TradesTab`: row click → navigate to symbol-detail with proper returnTo.
- [x] 7.3 Modify Deep's `TradesTab`: same.
- [x] 7.4 Back button handler: `appStore.route = returnTo`.

## 8. No-context degraded state

- [x] 8.1 If `backtestTaskId` is undefined (e.g. linked from outside): hide Trade Journal + mini charts; show "No trade context" banner.
- [x] 8.2 Chart still renders klines for the symbol (no markers).
- [x] 8.3 RightRail shows "Run a backtest to analyze trades on this symbol" CTA → Workspace Design with focused symbol pre-set.

## 9. Tests

- [x] 9.1 `e2e/visual/symbol-detail.spec.ts` with 3 baselines.
- [x] 9.2 Vitest: `screens/SymbolDetailScreen.test.tsx` — smoke + navigation.
- [x] 9.3 Vitest: `stores/tradeAnalysisStore.test.ts` — caching + error + retry.
- [x] 9.4 Vitest: `components/symbol/TradeAnalysisCard.test.tsx` — render happy + error.

## 10. Documentation

- [x] 10.1 `docs/design-alignment.md` — SymbolTopbar, TradeJournal, TradeAnalysisCard, SymbolEquityCard.

## 11. Final validation

- [x] 11.1 All tests green.
- [x] 11.2 Manual E2E: Preview → click trade → Symbol Detail with narrative → Back → Preview preserved state.
- [x] 11.3 No-context path: navigate directly via `{ kind: "symbol-detail", symbol: "BTC_USDT" }` (no taskId) → degraded state renders cleanly.
- [x] 11.4 Visual baselines match.
