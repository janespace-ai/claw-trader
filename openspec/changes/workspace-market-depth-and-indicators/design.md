# Design — Workspace Market Depth + Built-in Indicators

## Context

Workspace-three-zone-layout shipped a clean three-zone shell but the
center K-line panel and the left rail are still skeletal: no prices,
no indicators, no history beyond the latest 100 bars.  This change
fills those gaps without changing the overall layout topology.

Reference UI: gate.com's per-symbol trade page (provided by user).
Their chart shows price overlays (BB / MA), a volume subchart, and
a rich indicator submenu (KDJ / MACD / RSI / CCI / DMI / WR / VWAP /
…).  We don't need feature parity, but we should hit the basics.

## Goals / Non-Goals

**Goals:**
- Left rail rows show market context (price + 24h % minimum).
- K-line top bar shows 24h high / low / vol / quote-vol.
- K-line supports infinite scroll-left through historical bars.
- 25+ technical indicators available, toggle-able from a "+ 指标"
  menu, persisted per user.
- No new backend data dependencies (reuse existing aggregator
  cache + klines table).

**Non-Goals:**
- Indicator parameter customization (period sliders).  v1 ships
  defaults; v2 may add a "settings" cog on each indicator.
- Drawing tools (trendlines / fib).
- WebSocket real-time price ticks.  Polling only.
- Per-strategy chart preset (each strategy remembering its own
  indicator set).  Indicators are global per-user.

## Decisions

### D1: Swap K-line library to KLineChart, keep lightweight-charts
elsewhere

**Choice:** Replace the implementation behind `KlineChart.tsx`
(currently `lightweight-charts`) with [klinecharts](https://klinecharts.com).
Other chart components — `EquityCurve`, `DrawdownCurve`,
`MonthlyHeatmap` — keep `lightweight-charts`.

**Rationale:**
- klinecharts ships ~25 built-in indicators + a multi-pane layout
  (overlays on price + stacked subcharts) that matches the gate /
  Huobi / OKX style users already know.
- Apache 2.0 license, no application required (TradingView's
  Advanced Charts library would require an access agreement).
- Bundle adds ~140 KB gzipped — acceptable for a desktop app.
- The other chart components don't need indicators; they're
  static visualizations of backtest output and lightweight-charts
  fits them well.

**Alternative considered:**
- Hand-write each indicator on top of lightweight-charts.  Rejected:
  ~30 lines × 25 indicators ≈ 750 LOC of indicator math + UI for
  each, all of which has been written and battle-tested already in
  klinecharts.
- TradingView Advanced Charts.  Rejected: 3 MB JS, requires a
  separate access agreement, and the heavier API surface adds
  maintenance overhead we don't need.

### D2: Indicator picker = global, persisted in localStorage

**Choice:** A single `useChartIndicatorsStore` Zustand slice holds:
```
{ overlays: string[];   // e.g. ['MA', 'BOLL']
  subcharts: string[];  // e.g. ['VOL', 'MACD', 'RSI'] }
```
Persisted via Zustand's `persist` middleware to
`localStorage:claw:chart-indicators`.

**Rationale:**
- Per-strategy preset would force users to re-pick their favorite
  indicators every time they open a different strategy.  No.
- Subchart count = list length × ~80 px each, so we cap visible
  subcharts to **6** in the UI (more than that and the chart gets
  unusable on a 900-px window).

**Alternative considered:** Per-strategy.  Rejected (above).

### D3: K-line layout — fixed 360 px main + flex subcharts, capped

**Choice:** `SymbolKlinePane` becomes:

```
┌────────── Symbol info bar ─────────── 72 px ─┐
│ BTC_USDT  $77,649.9  +0.01%                  │
│ 24h H 78,120  L 76,400  Vol 1.2B  Q 87M      │
├──────────── Main K-line ──────────── 360 px ─┤
│ overlays paint here (MA / BOLL / SAR …)      │
├────── Subchart 1: Volume ────────── 80 px ──┤  always-on if 'VOL' in subcharts
├────── Subchart 2: RSI(14) ───────── 80 px ──┤  if 'RSI' in subcharts
├────── Subchart 3: MACD ─────────── 80 px ──┤  if 'MACD' in subcharts
└──────────────────────────────────────────────┘
```

The whole pane no longer has a fixed 420 px height — it grows with
the subchart count.  The OUTER center column flex still makes the
bottom tabs scrollable; the K-line zone takes its natural height up
to a cap of `72 + 360 + 6×80 = 912 px`, after which it scrolls.

**Rationale:** Users explicitly want stacked indicator subcharts;
fixed height + N subcharts can't both be true.  Capping at 6
prevents pathological growth.

### D4: History pagination — pan-triggered, 200-bar pages, dedup

**Choice:**
- Initial load: latest 200 bars via `getKlines({ limit: 200 })`.
- Subscribe to klinecharts's `subscribeAction(ActionType.OnVisibleRangeChange, …)`.
- When the leftmost rendered bar index ≤ 20:
  - Compute `oldest_ts = candles[0].ts`.
  - Fetch `getKlines({ to: oldest_ts - 1, limit: 200 })`.
  - Prepend to candles, dedup by `ts`.
  - Mark `endOfHistory = true` if response < 200 (no more bars).
- Debounce 250 ms, single-flight (skip if already loading).

**Rationale:** klinecharts's native API gives the visible range
hook for free.  200-bar pages balance request count vs payload
size.  Deduplication is needed because backend may include the
boundary bar in both pages.

**Trade-off:** First pan-left may stutter for ~150 ms while
fetch-prepend happens.  Acceptable; loading spinner not needed at
this latency.

### D5: Backend — populate `last_price` + `change_24h_pct` in
`listSymbols`

**Choice:** In `service-api/internal/handler/symbols.go` (or
equivalent), when serializing each `Symbol`:
1. Try the data-aggregator's in-memory top-of-book cache (it's
   already updated every minute by the worker).
2. On cache miss, run a single `SELECT close FROM klines WHERE
   symbol=$1 AND interval='1m' ORDER BY ts DESC LIMIT 1` for last
   price, plus a similar for 24h-ago close to compute pct.

**Rationale:** The aggregator already maintains this snapshot for
its own gap-detection logic — exposing it costs ~10 lines.  SQL
fallback exists for the cold-start case.

**Trade-off:** Two extra (cached) lookups per symbol.  At 200
symbols this is ≤ 2 ms total even without the cache.  Add a
single-fetch ceiling guard in case the SQL path is hit cold.

### D6: Symbol info bar — pull from `getSymbolMetadata` on focused
   change

**Choice:** `SymbolKlinePane` adds a new `useEffect` that, on
`focusedSymbol` change, calls `cremote.getSymbolMetadata({ symbol
})` and stores the result in component-local state.  Debounced
(300 ms) so rapid clicking doesn't fire 10 requests.

**Rationale:** The endpoint already returns 24h high / low / vol /
quote-vol.  No new endpoint needed.  Component-local state because
no other component needs this data.

### D7: Drop hand-written `RsiSubchart.tsx` + `computeRSI`

**Choice:** Once klinecharts ships RSI built-in, the hand-written
helper is dead.  Delete after grep confirms zero callers (Group 6
in tasks.md).

**Rationale:** Two implementations of RSI = bug factory.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| klinecharts upstream might disappear or break.  | Apache-2.0 lib, ~3k stars, active.  Vendor-pin in package.json.  If it ever goes stale, swapping out the wrapper component is bounded work since we only use it in `KlineChart.tsx`. |
| Bundle size +140 KB gzipped.  | Acceptable for desktop Electron; not loaded on the unbundled service-api or sandbox. |
| Backend `last_price` cache miss → 200 SQL queries on cold start.  | Add a 1-second timeout guard; fall back to `null` (frontend renders `—`) on timeout. |
| History pagination races with K-line interval switch (1m → 1h)  | Each fetch tagged with a request-id ref; older requests' results discarded on arrival.  Same pattern as the existing focusedSymbol fetch. |
| Indicator picker can list 25 items — overwhelming.  | Group by category (趋势 / 摆动 / 量能 / 形态), default-collapsed, search box at top of dropdown.  Common ones (MA/BOLL/VOL/MACD/RSI/KDJ) shown first. |
| Existing tests assert on `lightweight-charts` mock for `KlineChart`.  | Update tests to mock klinecharts; structural assertions (e.g. "renders a chart") should survive untouched. |

## Migration Plan

No data migration.  Wire-format change is purely additive.

Rollout sequence:
1. Backend ships the new `Symbol` fields (deployed independently;
   old clients ignore the extra fields).
2. Frontend regenerates types, lands the rail/info-bar updates,
   ships the chart library swap behind no flag (it's not
   user-toggleable — too many internals).
3. Smoke-test in dev for 1 day; merge.

Rollback:
- Backend revert: just drop the 2 fields (frontend handles null
  gracefully).
- Frontend revert: revert the commit; `KlineChart.tsx` returns
  to lightweight-charts.

## Open Questions

- **Should the indicator picker remember per-symbol or per-user?**
  Tentative: per-user (D2).  Confirm during pilot.
- **Default indicators on first launch?**  Tentative:
  `overlays=['MA']`, `subcharts=['VOL']`.  Conservative.
- **Should "+ 指标" surface a search box?**  Yes if list ≥ 15
  items (it will be).
