# Workspace Market Depth + Built-in Indicators

## Why

After the workspace-three-zone-layout landed, four gaps surfaced when
the user compared the screen to gate.com's actual trading page:

1. **Left rail rows have no market context.**  Just symbol names —
   no price, no 24h change, no volume.  Picking a symbol becomes
   blind.
2. **Top symbol info bar is sparse.**  Only price + name + interval
   picker.  Missing 24h high / low / vol — the basics every trading
   UI shows.
3. **K-line shows ~100 bars and stops.**  Panning left does nothing.
   Users can't see "what did this symbol look like a month ago?"
4. **Zero technical indicators.**  No RSI / MACD / KDJ / Bollinger
   / volume.  The competing reference (gate.com) ships ~30
   indicators built-in.

This change closes those four gaps in one chunk so the workspace
feels like a real trading research surface, not a placeholder.

## What Changes

### 1. Backend: enrich `/api/symbols` response  (BREAKING-ish)

- `Symbol` schema in `api/openapi.yaml` gains two **optional** fields:
  - `last_price?: number | null` — most recent close from the latest
    1m bar.
  - `change_24h_pct?: number | null` — 24h percent change vs 24h-ago
    close.
- service-api computes both in the existing `listSymbols` handler by
  reading the cached top-of-book snapshot the data-aggregator already
  maintains.  No new DB query if the cache exists; one fast SQL fetch
  if not.
- Field is **optional**, so legacy callers see no behaviour change
  when the value is null.

### 2. Frontend: left rail shows price / 24h % / vol

- `SymbolListPane` row layout grows from 1-column to 2-column
  (symbol on left, price + 24h % stacked on right; tiny vol on
  hover or always-visible if rail width allows).
- Cells fall back to `—` when the optional fields are null.

### 3. Frontend: top symbol info bar adds 4 fields

- `SymbolKlinePane` top bar adds, alongside price + 24h %:
  `24h 高` · `24h 低` · `24h 成交量` · `24h 成交额`.
- Pulls from `GET /api/symbols/:symbol/metadata` (existing endpoint,
  already returns these fields) on focusedSymbol change, debounced.

### 4. Frontend: K-line history pan-left load

- Replace the current "fetch latest 100 bars and stop" pattern with
  a paginated, on-demand history loader.
- When the user pans the chart so the leftmost visible bar is within
  20 bars of the loaded start, fetch the next 200 bars older via
  `getKlines({ to: oldest_loaded_ts })` and **prepend**.
- Debounced + dedup-guarded so pan-spam doesn't cause runaway
  fetches.

### 5. Frontend: swap K-line library to KLineChart for built-in
   indicators  (BREAKING for `KlineChart.tsx` callers)

- Replace the current `lightweight-charts`-based `KlineChart` with a
  new `KlineChart` backed by [KLineChart](https://klinecharts.com)
  (Apache 2.0, no licensing hassle).
- Built-in indicators: **MA / EMA / SMA / BOLL / SAR / BBI / VOL /
  MACD / KDJ / RSI / BIAS / BRAR / CCI / DMI / CR / PSY / DMA /
  TRIX / OBV / VR / WR / MTM / EMV / SAR / PVT / AO** — 25+ out of
  the box.
- New "+ 指标" dropdown in `SymbolKlinePane` lets the user toggle
  any subset; selection persists in localStorage under
  `claw:chart-indicators`.
- Two zones: **overlay indicators** (MA / BOLL / SAR / SMA / EMA …)
  paint on the price scale; **subchart indicators** (VOL / MACD /
  RSI / KDJ / CCI …) stack vertically below, sharing the same time
  axis.
- Existing `lightweight-charts`-based components stay (`EquityCurve`,
  `DrawdownCurve`, `MonthlyHeatmap` — they're not K-line viewers
  and lightweight-charts fits them well).
- The hand-written `RsiSubchart.tsx` and `computeRSI()` helper are
  retired (the post-backtest result drill-down wasn't using it
  anyway in current code, but a grep-and-clean is in the cleanup
  task).

## Capabilities

### New Capabilities

- `chart-indicators`: toggle-able technical indicators (overlay +
  subchart) on the workspace K-line, persisted per-user in
  localStorage.
- `chart-history-pagination`: lazy-load older K-line bars when the
  user pans the chart leftward.

### Modified Capabilities

- `workspace-universe-rail`: rows surface `last_price` +
  `change_24h_pct` (with `—` fallback), not just symbol identifier.
- `unified-strategy-workspace`: the center-top zone gets a richer
  symbol info bar (24h high / low / vol / quote-vol) and an
  indicator picker.
- `symbol-management` (or `api-contract` — TBD which owns the
  schema): `Symbol` API schema gains 2 optional fields.

## Impact

- **service-api** (Go):
  - Modify `internal/handler/symbols.go` (or wherever `listSymbols`
    lives) to populate `last_price` + `change_24h_pct`.
  - Reuse the data-aggregator's snapshot cache; fall back to a
    `SELECT … FROM klines WHERE symbol=$1 ORDER BY ts DESC LIMIT 1`
    query when cache is empty.
- **api/openapi.yaml**:
  - Add 2 optional fields to `Symbol` schema.
  - Regenerate `desktop-client/src/types/api.d.ts` via existing
    codegen script.
- **desktop-client**:
  - New dep: `klinecharts` (or `klinecharts-react`).
  - New: `src/components/charts/IndicatorPicker.tsx`,
    `src/stores/chartIndicatorsStore.ts`,
    history-load wiring inside `SymbolKlinePane`.
  - Rewrite: `KlineChart.tsx` (now wraps klinecharts).
  - Modify: `SymbolListPane.tsx` (2-column row),
    `SymbolKlinePane.tsx` (richer info bar + indicator picker
    integration), `universeStore.ts` (consume new `Symbol` fields).
  - Delete: `RsiSubchart.tsx`, `computeRSI` helper (after the
    klinecharts swap covers RSI).
- **tests**:
  - Update `universeStore.test.ts` fixture with the 2 new fields.
  - New test: indicator-picker selection persists / restores from
    localStorage.
  - New test: history-pagination fetches older bars and dedups.
- **Pencil**: 1 new frame `USW3Z+ · K线 · 多指标`(replaces the
  static K-line block in `A7ubw`, doesn't delete the old).
- **No backend data migration.**  Pure additive on the wire format.

## Out of Scope

- Drawing tools (trendlines / fib / etc).  Add later if pilot
  demands it.
- Indicator parameter customization UI (period sliders).  v1 ships
  default params per indicator (RSI(14), MACD(12,26,9), …).
- Server-side indicator computation.  klinecharts computes locally;
  fast enough for ≤ 5000 bars.
- Real-time price tick stream.  Universe rail prices refresh on
  page focus + a 60s polling cadence — no WebSocket subscription
  yet.
