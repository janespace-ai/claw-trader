# Chart Engine: Swap to TradingView Lightweight Charts v5 + technicalindicators

## Why

We landed `workspace-market-depth-and-indicators` on **klinecharts** for
its 27 built-in indicators and out-of-the-box multi-pane.  After
dogfooding, the user has decided to swap to **TradingView Lightweight
Charts v5** + the **`technicalindicators`** calc library — same
"all 27 + a few extras" indicator coverage, but on the chart engine
TradingView itself maintains.

Reasons:
- Consistency with how the rest of the desktop client renders charts
  (EquityCurve / DrawdownCurve / MonthlyHeatmap already use
  Lightweight Charts).
- TradingView is the canonical "look" users recognise from
  professional trading platforms.
- Lightweight Charts **v5** added native multi-pane (`chart.addPane()`)
  in 2025, eliminating the historical reason we picked klinecharts.
- The `technicalindicators` library (~50 indicators, MIT, ~500 k
  weekly downloads on npm) covers everything klinecharts shipped
  PLUS several klinecharts didn't (VWAP, SuperTrend, Ichimoku,
  Keltner Channels).
- klinecharts is currently in v10.0.0-**beta1** — pinning to a beta
  for a critical path is a maintenance smell.

The user-facing UX (left rail / center K-line + indicator bar /
right chat / bottom tabs / per-pane × close / fixed total height /
draggable pane separators / scroll-to-real-time on init) is
**preserved verbatim** — this is purely a chart-engine swap.

## What Changes

### Library swap

- **Upgrade `lightweight-charts` from v4.2.3 → v5.x** (latest stable).
  v5 has breaking API changes (`addCandlestickSeries()` →
  `addSeries(CandlestickSeries, ...)` + new pane API).
- **Add `technicalindicators` ^3.x** as the calc layer for all
  technical indicators.
- **Remove `klinecharts`** entirely from `package.json`.

### KlineChart.tsx — full rewrite

- Backed by Lightweight Charts v5 instead of klinecharts.
- Multi-pane via `chart.addPane()` (native v5).
- Each indicator computed by a `technicalindicators` function then
  rendered via `pane.addSeries(LineSeries, …)` / `HistogramSeries` /
  `BollingerBandsSeries`-style stacks.
- Pan-to-load-older history via `timeScale().subscribeVisibleTimeRangeChange`
  (same pattern Lightweight Charts has always supported).
- Theme tokens flowed through `chart.applyOptions({layout, ...})`.

### Indicator registry — new abstraction

- `src/chart/indicators/registry.ts` maps indicator name →
  `{ kind: 'overlay' | 'subchart', compute(candles, opts), render(pane, values) }`.
- One file per indicator: `src/chart/indicators/MA.ts`, `BOLL.ts`,
  `MACD.ts`, …
- Adding a new indicator = drop a new file + register it in
  `registry.ts`.

### Indicator catalog (31 = 27 ported + 4 new)

**Overlays (8)**: MA, EMA, SMA, BOLL, SAR, BBI, AVP,
**+ VWAP (new)**, **+ SuperTrend (new)**, **+ Ichimoku Cloud (new)**,
**+ Keltner Channels (new)**

**Subcharts (20)**: VOL, MACD, RSI, KDJ, CCI, BIAS, BRAR, CR, PSY,
DMA, TRIX, OBV, VR, WR, MTM, EMV, DMI, PVT, AO, ROC

(Final count: 8 overlays + 20 subcharts = 28 from klinecharts +
4 new TradingView-friendly = **31 indicators**.)

### Companion chart components migrated to v5

- `EquityCurve.tsx` / `DrawdownCurve.tsx` / `MonthlyHeatmap.tsx`
  must update their `addLineSeries`/`addAreaSeries`/etc calls to
  the v5 form (the package is a single dep, can't multi-version).

### Cleanup

- Delete `klinecharts` from `package.json` + `pnpm-lock.yaml`.
- Delete `src/stores/chartIndicatorsStore.ts`'s indicator name
  constants (move to the new registry); keep the
  overlays/subcharts arrays + persistence.
- Update `IndicatorBar.tsx` to read indicator names from the
  registry instead of the hardcoded constants.

## Capabilities

### New Capabilities

- `chart-engine`: TradingView Lightweight Charts v5 wrapped in
  our `KlineChart` component, with multi-pane support, theme-token
  binding, and pan-to-load-older history pagination.
- `chart-indicator-registry`: declarative registry mapping
  indicator names to compute functions (from `technicalindicators`)
  and render functions (against Lightweight Charts series APIs).

### Modified Capabilities

- `chart-indicators`: indicator catalog grows by 4 (VWAP, SuperTrend,
  Ichimoku Cloud, Keltner Channels).  Selection persistence
  unchanged.  Subchart cap unchanged at 6.
- `chart-history-pagination`: unchanged behaviour — pan-left fetches
  200 older bars — but now implemented via Lightweight Charts'
  `timeScale().subscribeVisibleTimeRangeChange` rather than
  klinecharts' `DataLoader`.

## Impact

- **Bundle**: `lightweight-charts` already present (~80 KB
  gzipped), `technicalindicators` adds ~50 KB.  klinecharts goes
  away (~140 KB).  **Net: ~10 KB smaller.**
- **`desktop-client/package.json`**: bump `lightweight-charts` to
  ^5; add `technicalindicators` ^3; remove `klinecharts`.
- **3 existing chart components migrated to v5 API**:
  `EquityCurve.tsx`, `DrawdownCurve.tsx`, `MonthlyHeatmap.tsx`.
- **`KlineChart.tsx`**: full rewrite (~400 lines).
- **New**: `src/chart/` directory holding the indicator registry +
  one file per indicator + a small `paneRenderer.ts` helper.
- **`SymbolKlinePane.tsx`**: minor — its `loadBars` callback shape
  may change to match the new chart's pagination hook.
- **`chartIndicatorsStore.ts`**: the OVERLAY_INDICATORS /
  SUBCHART_INDICATORS arrays move into the registry; store keeps
  only the persisted selection state.
- **Tests**: existing `chartIndicatorsStore.test.ts` /
  `IndicatorBar.test.tsx` unchanged structurally; new tests for
  the registry + a few indicator compute functions.

## Out of Scope

- Drawing tools (trendlines / fib / etc).
- WebSocket real-time tick subscription (same as before — polling).
- Per-indicator parameter UI (period sliders).  Defaults are
  hardcoded per indicator.
- Pine Script support.  Always out of scope.
