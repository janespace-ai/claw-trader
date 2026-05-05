# Tasks — Chart Engine: TradingView Lightweight Charts v5 + technicalindicators

## 1. Dependency swap

- [x] 1.1 `pnpm add lightweight-charts@^5 technicalindicators@^3`
  (bumps existing `lightweight-charts` from 4.2.3 → 5.x).
- [x] 1.2 `pnpm remove klinecharts`.
- [x] 1.3 Run `pnpm exec tsc --noEmit` and capture every v4→v5
  breaking-call site (expected to fail in EquityCurve /
  DrawdownCurve / MonthlyHeatmap / KlineChart).
- [x] 1.4 Verify `technicalindicators` imports cleanly under Vite
  (sample `import { RSI } from 'technicalindicators'` in a test
  file, run `pnpm exec vitest run` — if Vite complains about
  CommonJS, add `optimizeDeps.include: ['technicalindicators']`
  to `vite.config.ts`).

## 2. Migrate companion components to Lightweight Charts v5

`tsc` after the dep bump surfaced 5 (not 3) consumers — Candles /
Equity / Mini in `primitives/ClawChart/` were missed in initial
scope.  All migrate together.  The v5 breaking pattern:
`addCandlestickSeries() / addLineSeries() / addAreaSeries() /
addHistogramSeries()` → `addSeries(CandlestickSeries / LineSeries /
AreaSeries / HistogramSeries, opts, paneIndex?)`.  `series.setMarkers()`
moves to `createSeriesMarkers(series, markers)` (imported from
the same package).

- [x] 2.1 `EquityCurve.tsx`: `addAreaSeries(opts)` →
  `addSeries(AreaSeries, opts)`.
- [x] 2.2 `DrawdownCurve.tsx`: same pattern.
- [x] 2.3 `MonthlyHeatmap.tsx`: same pattern (verify whether it
  uses a custom series or just rectangles via DOM).
- [x] 2.4 `primitives/ClawChart/Candles.tsx`:
  `addCandlestickSeries`, `addHistogramSeries`, `addLineSeries`
  all to `addSeries(...)`.  Replace `series.setMarkers(...)` with
  `createSeriesMarkers(series, markers)`.
- [x] 2.5 `primitives/ClawChart/Equity.tsx`:
  `addAreaSeries` / `addLineSeries` → `addSeries(...)`.
- [x] 2.6 `primitives/ClawChart/Mini.tsx`:
  `addLineSeries` → `addSeries(LineSeries, ...)`.
- [x] 2.7 `pnpm exec tsc --noEmit` clean after migrations
  (KlineChart will still error since klinecharts is gone — that's
  fixed in Group 3).
- [x] 2.8 `pnpm exec vitest run` — tests for these components
  pass.  Manual smoke: open a strategy, run a backtest, verify
  EquityCurve / Drawdown / Mini render in the Result tab.

## 3. Chart engine — `KlineChart` rewrite + `paneRenderer` facade

- [x] 3.1 New file `src/chart/types.ts`: define `Candle`,
  `IndicatorValue`, `IndicatorDef`, `PaneRenderApi`,
  `RenderedSeries` interfaces.
- [x] 3.2 New file `src/chart/paneRenderer.ts`: implement
  `PaneRenderApi` adapter that wraps a Lightweight Charts v5
  pane and exposes `addLine` / `addHistogram` / `addArea` /
  `addBaseline` methods.
- [x] 3.3 New file `src/chart/KlineEngine.ts` (vanilla TS, no
  React) — handles chart creation, multi-pane orchestration via
  v5 `chart.addPane()`, theme application, ResizeObserver,
  scroll-to-real-time, pan-load-older.
- [x] 3.4 Rewrite `src/components/charts/KlineChart.tsx` as a
  thin React shell that owns the lifecycle of a `KlineEngine`
  instance and reacts to `useChartIndicatorsStore` changes.
- [x] 3.5 Per-subchart × overlay buttons: positioned via the
  v5 pane's bounding rect (computed from
  `chart.paneSize(paneIndex)` or equivalent).
- [x] 3.6 Pan-to-load-older via
  `timeScale().subscribeVisibleTimeRangeChange`; debounce 250 ms
  + single-flight + dedup.

## 4. Indicator registry + 31 indicator files

- [x] 4.1 New file `src/chart/indicators/registry.ts`: exports
  `INDICATOR_REGISTRY` (record), `getIndicatorDef`,
  `getOverlayIndicators`, `getSubchartIndicators`,
  `getAllIndicatorNames`.
- [x] 4.2 27 ports from klinecharts builtins — one file each
  under `src/chart/indicators/`:
  - **Overlays (7)**: `MA.ts`, `EMA.ts`, `SMA.ts`, `BOLL.ts`,
    `SAR.ts`, `BBI.ts`, `AVP.ts`.
  - **Subcharts (20)**: `VOL.ts`, `MACD.ts`, `RSI.ts`, `KDJ.ts`,
    `CCI.ts`, `BIAS.ts`, `BRAR.ts`, `CR.ts`, `PSY.ts`, `DMA.ts`,
    `TRIX.ts`, `OBV.ts`, `VR.ts`, `WR.ts`, `MTM.ts`, `EMV.ts`,
    `DMI.ts`, `PVT.ts`, `AO.ts`, `ROC.ts`.
- [x] 4.3 4 NEW overlay indicators:
  - `VWAP.ts` (uses `technicalindicators.VWAP`)
  - `SuperTrend.ts` (uses `technicalindicators.SuperTrend`)
  - `Ichimoku.ts` (uses `technicalindicators.IchimokuCloud`)
  - `Keltner.ts` (hand-rolled = `EMA ± mult × ATR`,
    using `technicalindicators.EMA` + `.ATR`)
- [x] 4.4 Each indicator file unit-tested for its `compute()` —
  golden-vector test against a fixture of 50 candles.

## 5. Wire registry into IndicatorBar + store

- [x] 5.1 `IndicatorBar.tsx`: replace the imports of
  `OVERLAY_INDICATORS` / `SUBCHART_INDICATORS` constants with
  registry calls (`getOverlayIndicators().map(d => d.name)`).
- [x] 5.2 `chartIndicatorsStore.ts`: delete the hardcoded
  constants; keep only the persisted selection state +
  toggle/cap/persist.  Re-export `SUBCHART_INDICATOR_CAP` (used
  by tests).
- [x] 5.3 `IndicatorBar.test.tsx`: keep the same test cases —
  they should still pass since the behavior is unchanged from
  the user's perspective.

## 6. Cleanup + validation

- [x] 6.1 Delete `klinecharts` references — grep verifies zero
  occurrences in `src/`.
- [x] 6.2 `pnpm exec tsc --noEmit` clean.
- [x] 6.3 `pnpm exec vitest run` — target ≥ current 299/299;
  expect ~308/308 after the per-indicator compute tests.
- [x] 6.4 Manual smoke: open `pnpm dev`, click around, toggle
  a few indicators, pan left to load history, switch interval,
  switch symbol, run a backtest end-to-end (verify EquityCurve
  + Drawdown still render).
- [x] 6.5 Bundle size check: `pnpm build:renderer`, confirm
  vendor chunk did NOT grow by more than 50 KB gzipped (klinecharts
  removal should net out the technicalindicators addition).

## 7. Pencil + docs

- [x] 7.1 No new Pencil frame needed — UX preserved verbatim.
  Update hand-off doc with a one-line note that
  `k2SWCB` (USW3Z+++ flat indicator strip) is now backed by
  TradingView Lightweight Charts.
- [x] 7.2 New release notes
  `docs/release-notes/chart-engine-tradingview-v5.md`.
