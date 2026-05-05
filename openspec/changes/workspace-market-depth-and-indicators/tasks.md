# Tasks — Workspace Market Depth + Built-in Indicators

## 1. Backend (`service-api`) — enrich Symbol payload

- [x] 1.1 Update `api/openapi.yaml`: add 2 optional fields to
  `Symbol` schema (`last_price?: number | null`,
  `change_24h_pct?: number | null`).  Validate with `make api:lint`.
- [x] 1.2 Regenerate Go server types (`make api:codegen` or
  equivalent).
- [x] 1.3 In `service-api/internal/handler/symbols.go` (or wherever
  `listSymbols` is wired): on each item, populate `last_price` +
  `change_24h_pct` by reading the data-aggregator's snapshot cache;
  fallback to a `SELECT close FROM klines WHERE symbol=$1 AND
  interval='1m' ORDER BY ts DESC LIMIT 1` (with a 1s timeout
  guard).
- [x] 1.4 Compute `change_24h_pct` as
  `(last_close - close_24h_ago) / close_24h_ago * 100`; null when
  either close is missing.
- [x] 1.5 Add a Go unit test covering: fully-populated, cold-cache
  with SQL fallback, both-null cases.

## 2. API contract regen (frontend)

- [x] 2.1 Run `pnpm openapi:generate` (or equivalent script) to
  regenerate `desktop-client/src/types/api.d.ts`.
- [x] 2.2 Verify `Symbol` type now has the 2 new optional fields.

## 3. Universe rail — show price + 24h %

- [x] 3.1 Update `UniverseRow` in `SymbolListPane.tsx`: 2-column
  layout, symbol on left, stacked price + 24h % on right.
- [x] 3.2 Add a `formatPrice(p: number)` helper:
  `≥1000` thousand-sep + 2dp, `[1, 1000)` 2dp, `[0.01, 1)` 4dp,
  `<0.01` 6dp.
- [x] 3.3 Render `—` for null `last_price` / `change_24h_pct`.
  Color: green if pct > 0, red if pct < 0, fg-muted if null/0.
- [x] 3.4 Update `universeStore.test.ts` fixture with the 2 new
  fields; assert sort order unchanged.
- [x] 3.5 Update `SymbolListPane.test.tsx` to assert the new cells
  render.

## 4. K-line top bar — richer symbol info

- [x] 4.1 In `SymbolKlinePane.tsx`: on `focusedSymbol` change
  (debounced 300 ms), call `cremote.getSymbolMetadata({ symbol })`;
  store result in component-local state.
- [x] 4.2 Render `24h H · 24h L · 24h Vol · 24h 成交额` next to the
  existing price block.  Format vol/quote-vol with K/M/B suffix.
- [x] 4.3 Loading + null fallback: render `—` for each field while
  metadata is still loading or returns null.

## 5. Swap K-line library to klinecharts

- [x] 5.1 `pnpm add klinecharts` (lock to current latest minor).
- [x] 5.2 Rewrite `KlineChart.tsx`: same external Props
  (`candles`, `trades`, `height`) but internally constructs a
  klinecharts instance via `init(ref.current)`.  Map our
  `KlineCandle` → klinecharts kdata format.
- [x] 5.3 Wire the `candleConvention` setting (red-up vs green-up)
  to klinecharts' candle styles via `setStyles(...)`.
- [x] 5.4 Translate trade markers (entry/exit arrows) into
  klinecharts overlays (`createOverlay({ name: 'arrow', ... })`).
- [x] 5.5 Update theme tokens: pass our CSS-var-resolved colors
  into `setStyles()` on mount + when theme changes.
- [x] 5.6 Update tests / mocks that depend on the old
  lightweight-charts surface.  Visual regression is manual smoke
  only.

## 6. Indicator picker

- [x] 6.1 New file
  `desktop-client/src/stores/chartIndicatorsStore.ts` — Zustand
  slice with `{ overlays: string[]; subcharts: string[] }` plus
  `addOverlay`, `removeOverlay`, `addSubchart`, `removeSubchart`,
  persisted via Zustand `persist` middleware to
  `localStorage:claw:chart-indicators`.  Defaults: overlays=['MA'],
  subcharts=['VOL'].
- [x] 6.2 Subchart cap of 6: `addSubchart` returns `false` and
  surfaces a notice when at the cap.
- [x] 6.3 New component
  `desktop-client/src/components/charts/IndicatorPicker.tsx`:
  dropdown trigger "+ 指标", grouped list (趋势 / 摆动 / 量能 /
  其他), checkbox per indicator, search box at top when ≥ 15
  items.
- [x] 6.4 Mount the picker in `SymbolKlinePane`'s top bar (right
  side, next to the interval picker).
- [x] 6.5 In `KlineChart.tsx`: subscribe to chartIndicatorsStore;
  on change, diff against the chart's current indicators and
  call `chart.createIndicator(name, isStack, paneOptions)` /
  `chart.removeIndicator(paneId, name)` accordingly.
- [x] 6.6 Each subchart pane renders a tiny "×" button (positioned
  absolutely over the pane top-right) that calls
  `removeSubchart(name)`.

## 7. K-line history pagination

- [x] 7.1 `SymbolKlinePane`: replace the 100-bar fetch with a
  paginated loader.  Initial: 200 bars.  State:
  `{ candles, oldestTs, endOfHistory, loading, requestId }`.
- [x] 7.2 Subscribe to klinecharts `subscribeAction` for visible
  range change.  When leftmost-rendered index ≤ 20 AND
  !endOfHistory AND !loading: trigger fetch of 200 older bars
  via `getKlines({ to: oldestTs - 1, limit: 200 })`.
- [x] 7.3 Debounce 250 ms; single-flight via in-flight ref.
- [x] 7.4 On fetch resolve: dedup against existing candles by
  `ts`; if returned < 200 → set endOfHistory=true.
- [x] 7.5 On focusedSymbol change OR interval change: reset
  `oldestTs`, `endOfHistory`; bump `requestId` to invalidate
  in-flight fetches.
- [x] 7.6 Telemetry: emit `kline_history_load { symbol, interval,
  added, total }`.

## 8. Cleanup

- [x] 8.1 Grep for `RsiSubchart` / `computeRSI` references; delete
  `src/components/charts/RsiSubchart.tsx` if no callers.
- [x] 8.2 Remove the `indicators` prop from the old `KlineChart`
  if no callers depend on it (the new chart lib handles this
  natively).

## 9. Pencil

- [x] 9.1 Author 1 new frame `USW3Z+ · K线 · 多指标` in
  `docs/design/trader.pen` showing the K-line zone with: top info
  bar (full fields), main candles + MA overlay, Volume subchart,
  RSI subchart, MACD subchart, "+ 指标" button.
- [x] 9.2 Update
  `docs/design/unified-strategy-workspace-frames.md` hand-off
  doc with the new frame ID.

## 10. Tests

- [x] 10.1 `chartIndicatorsStore.test.ts`: add/remove,
  6-subchart cap returns false, persist hydrate from
  localStorage.
- [x] 10.2 `IndicatorPicker.test.tsx`: groups render, checkbox
  toggle calls store, search filters list.
- [x] 10.3 `kline-history.test.ts` (or in `SymbolKlinePane.test`):
  initial 200-bar load, pan-trigger fetches older 200, dedup,
  endOfHistory after short response.
- [x] 10.4 `vitest run` passes (target ≥ current 285/285,
  expect 285 → ~292 after additions).

## 11. Docs

- [x] 11.1 New release notes
  `docs/release-notes/workspace-market-depth-and-indicators.md`.
- [x] 11.2 Update `README.md` "What you can do" section if it
  mentions chart features (probably not; check).

## 12. UX revision (post-pilot, 2026-05-03)

After dogfooding the v1 layout, three issues surfaced:
(1) the "+ 指标" button in the chart top-bar competed visually
with the price; gate.com puts indicator controls below the chart.
(2) Adding a subchart compressed the main K-line, which made the
candles harder to read.  (3) No per-pane × close — users had to
hunt for the chip in the picker dropdown to remove an indicator.

- [x] 12.1 New Pencil frame `JHpLq` (USW3Z++ · K线 · 指标交互)
  documents the revised layout (chart panes + per-pane × +
  bottom-strip indicator bar with active chips).  Hand-off doc
  updated.
- [x] 12.2 New `IndicatorBar` component placed BELOW the K-line
  area (gate-style strip with active overlay/subchart chips +
  embedded `IndicatorPicker` trigger).  Each chip has a × that
  removes the indicator.
- [x] 12.3 Removed `<IndicatorPicker />` from the K-line top-bar
  right cluster — only interval picker remains there.
- [x] 12.4 `KlineChart` now sizes its own container to the SUM of
  pane heights (main + N×subchart + axis) so adding a subchart
  GROWS the container instead of compressing the main pane.
- [x] 12.5 Each subchart pane is created with
  `dragEnabled: true` + `minHeight: 60`, so the user can resize
  any pane (main, subcharts) by dragging the inter-pane separator.
  klinecharts handles the drag natively; we listen to `onPaneDrag`
  to recompute the container height to track new pane sizes.
- [x] 12.6 Per-subchart × overlay: React buttons absolutely
  positioned at the top-right of each subchart pane (top offset
  computed from cumulative pane heights), call
  `removeSubchart(name)` on click.
- [x] 12.7 New i18n keys (`workspace.indicators.label`,
  `workspace.indicators.dragHint`, `workspace.kline.vol24h`,
  `workspace.kline.bars`, plus the existing ones now properly in
  zh.json + en.json instead of relying on `defaultValue`).
- [x] 12.8 Verified `tsc --noEmit` clean and `vitest run` →
  297/297 passing after the rewrite.

## 13. UX revision v2 (2026-05-03 same-day, after gate.com cross-check)

User compared v1 of the indicator UX against gate.com directly and
found three issues: (a) hidden-behind-dropdown picker — gate
shows all indicator names flat; (b) main K-line is too short
(380 px) — gate runs ~520-560 px; (c) the "container grows on
add" decision actually feels worse than gate's "fixed total height,
adding compresses what's there" because each indicator becomes
useful only above a min-readable height anyway.  Plus a real
backend bug surfaced: pan-left pagination silently dies after the
30-day default `from` window.

- [x] 13.1 New Pencil frame `k2SWCB` (USW3Z+++ · K线 · 平铺指标条)
  documents the gate-style flat 2-row strip (主图 / 副图), each
  indicator a clickable toggle.  Hand-off doc updated; `JHpLq`
  marked superseded.
- [x] 13.2 **Backend pan-left fix**: `service-api/internal/handler/kline.go`
  rewrote the default-windowing rules.  When only `to` is passed
  (the pagination case), `from` now defaults to **epoch** instead
  of `now - 30 days`.  Combined with the existing `limit` slice,
  this returns the N bars immediately before `to` for any age.
- [x] 13.3 `KlineChart`: total chart height is FIXED via the
  `height` prop again (default bumped 380 → 560 to match gate's
  proportion).  Adding subcharts compresses the layout
  (klinecharts-native behavior).
- [x] 13.4 Per-subchart × overlay still rendered, now positioned
  by reading klinecharts' own pane `getSize(paneId).top` so they
  track user drag-resizes and pane redistribution correctly.
- [x] 13.5 New flat `IndicatorBar`: 2 horizontal scrollable rows,
  every indicator name clickable to toggle, active = filled,
  inactive = flat. Shows subchart counter (e.g. "1/6") + inline
  cap notice.  Replaces both the popover-style `IndicatorPicker`
  AND the v1 chip-strip.
- [x] 13.6 Deleted `IndicatorPicker.tsx` + its test (no longer
  referenced anywhere; flat bar replaces it).
- [x] 13.7 Replaced the picker test with `IndicatorBar.test.tsx`
  (6 tests covering both rows, toggle, data-active, cap notice,
  counter).
- [x] 13.8 Verified Go `build` / `vet` clean and frontend
  `tsc --noEmit` clean; `vitest run` → 299/299 passing
  (was 297; net +2 after the picker → bar swap).

## 14. Init = latest data (2026-05-03 follow-up)

User reported the chart's default view appeared to show "historical"
rather than "latest" bars.  Two parts: (a) make the chart's intent
explicit (always pass `to=now()` on init + scroll-to-real-time), and
(b) flag a data-freshness check (the dev backend's data-aggregator
may not have pulled bars in N days).

- [x] 14.1 `SymbolKlinePane.loadBars` now ALWAYS sets `to`
  explicitly: `init` → `to=now()`, `backward` → `to=oldest_loaded_ts-1`.
  Removes implicit reliance on backend-default windows.
- [x] 14.2 `KlineChart`: after `type='init'` data lands, call
  `chart.setOffsetRightDistance(50)` + `chart.scrollToRealTime(0)`
  so the latest bar glues to the right edge with a small breathing
  margin.  Defensive — handles cases where klinecharts leaves
  unwanted right-padding on first paint.
- [x] 14.3 Diagnosis note for data-freshness issues: if the chart
  loads but the rightmost bar's timestamp is days old, that's a
  data-aggregator gap — not a chart bug.  Check
  `docker ps | grep aggregator` on the backend host and inspect
  recent gap-detection logs.
