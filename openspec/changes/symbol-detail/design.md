## Context

Symbol Detail is the "look at one trade in detail" view. Entry path is important: user is mid-way through Preview/Deep analysis, sees an interesting trade, clicks to drill in, reads the AI's explanation, then returns to continue review.

The `SymbolDetailPage.tsx` orphan (currently unused) suggests someone started this work before; we replace it entirely.

## Goals / Non-Goals

**Goals:**
- Pixel fidelity to `s9ooT` + `Aib9J`.
- Clicking any trade row in Preview/Deep opens Symbol Detail with that trade pre-selected.
- Trade Analysis narrative populates within 3s (target).
- Back button restores the prior route exactly.

**Non-Goals:**
- Editing trade data (it's retrospective).
- Portfolio-level symbol view.
- Real-time price updates on the header chips.

## Decisions

### D1. Trade Analysis auto-fires on row click, no explicit "Explain" button

**Decision.** Selecting a trade row immediately triggers `cremote.explainTrade({ backtest_task_id, symbol, trade_id })` (synchronous endpoint, ~1-3s). Result renders in RightRail.

Pros: zero clicks beyond selection.
Cons: can waste LLM calls if user scrolls trades rapidly. Mitigation: debounce selection 300ms before firing.

### D2. Trade Analysis result as structured card, not chat bubble

**Decision.** The `TradeExplainResult` shape (narrative + indicators + regime + exit_context) renders as a structured card (similar to `StrategySummaryCard` / `ImprovementCard`). Not a chat bubble, because the Trade Analysis persona is read-only.

### D3. Return path preserved via `returnTo` on the route

**Decision.** `route = { kind: "symbol-detail", symbol, returnTo: <previous route> }`. Back button sets `appStore.route = returnTo`. Workspace sub-state (mode, currentTaskId) preserved in `workspaceStore` independently.

### D4. Chart shows only this symbol, full backtest window

**Decision.** Chart fetches klines for the full backtest window (typically 180d for Deep, 7d for Preview) and overlays all trades for this symbol. Trade marker colors indicate pnl direction (green for positive, red for negative).

Selected trade is highlighted (bordered or pulsing) on the chart.

### D5. Mini equity + drawdown: from per_symbol data

**Decision.** `per_symbol[this_symbol].equity_curve` → `ClawChart.Mini` with a little area fill. `per_symbol[this_symbol].drawdown_curve` → `ClawChart.Equity variant="single"` in drawdown styling (red).

These are small charts, ~200×80 each, stacked vertically to the right of the Trade Journal.

## Risks / Trade-offs

- **[LLM call per trade click is expensive]** → Cache: same `trade_id` → don't re-fire. Ideally backend caches the result too (keyed by trade_id). Frontend-only cache is simpler.

- **[Large trade journal (500+ trades)]** → Virtualize. Reuse the virtualization logic from `TradesTab`.

- **[Navigation back to Workspace preserves mode correctly]** → Test: enter Symbol Detail from Deep mode → back → should land in Deep with previously-focused symbol. State lives in `workspaceStore`, which is independent of the `route` — so navigation preservation is "free".

## Migration Plan

1. Delete orphaned `src/pages/SymbolDetailPage.tsx`.
2. Add new route handler in `App.tsx`.
3. Wire entry points in Preview/Deep Trade rows.

## Open Questions

- If the user comes from a Screener result (no backtest context), `explainTrade` can't produce a narrative (no trade happened yet, it's hypothetical). → Solution: hide the Trade Analysis card, show a note "No trade context — run a backtest to see trade-level analysis".
- Should the header have a "Run backtest on this symbol" CTA for the Screener path? → Yes, useful. Adds a button "New strategy from this symbol" → Workspace Design with focused symbol pre-set.
