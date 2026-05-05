# Release: Chart Engine swap → TradingView Lightweight Charts v5

Follow-on to [workspace-market-depth-and-indicators](./workspace-market-depth-and-indicators.md).

## TL;DR

Under the hood: the workspace K-line viewer is now backed by
**TradingView Lightweight Charts v5** + the **`technicalindicators`**
calc library, replacing klinecharts.  Same UX surface — just a
cleaner, more familiar chart engine and 4 new indicators.

## What changed

### Library swap

- ⬆️ `lightweight-charts`: `4.2.3` → `5.2.0` (gives us native
  multi-pane via `chart.addPane()`).
- ➕ `technicalindicators` `^3.1.0` (Apache 2.0 / MIT-style; pure
  calc — ~50 indicators).
- ➖ `klinecharts` removed entirely.

### New indicators (4 added — overlay)

| Indicator | What |
|---|---|
| **VWAP** | Volume-Weighted Average Price |
| **SuperTrend** | ATR-based trend line with regime flip color |
| **Ichimoku Cloud** | Tenkan / Kijun / Senkou A / Senkou B |
| **Keltner Channels** | EMA ± multiplier × ATR (similar shape to Bollinger but ATR-based) |

Total catalog: **31 indicators** (11 overlay + 20 subchart).

### Internal architecture

- New `src/chart/` directory:
  - `types.ts` — `Candle`, `IndicatorDef`, `PaneRenderApi`,
    `RenderedIndicator`.
  - `paneRenderer.ts` — thin facade over Lightweight Charts pane
    API; indicators talk to this, not to `lightweight-charts`
    directly.
  - `indicators/registry.ts` — single source of truth for which
    indicators exist + their classification (overlay/subchart).
  - `indicators/<NAME>.ts` × 31 — one file per indicator.
- `KlineChart.tsx` rewritten as a thin React shell that owns chart
  lifecycle and reacts to `useChartIndicatorsStore` changes.
- `IndicatorBar.tsx` reads names from the registry — adding a new
  indicator requires zero changes to `IndicatorBar`.
- `chartIndicatorsStore.ts` keeps only persisted user selection;
  the hardcoded `OVERLAY_INDICATORS` / `SUBCHART_INDICATORS`
  constants are gone (registry is the source of truth now).

### Companion components migrated

`EquityCurve` / `DrawdownCurve` / `MonthlyHeatmap` /
`primitives/ClawChart/{Candles,Equity,Mini}` all moved from v4
`addCandlestickSeries() / addLineSeries() / addAreaSeries()` to v5
`addSeries(SeriesDefinition, opts, paneIndex?)` form.
`series.setMarkers()` migrated to the v5 plugin pattern via
`createSeriesMarkers(series, markers)`.

## What did NOT change (UX)

Every visible behavior from the prior change is preserved:

- Three-zone workspace layout
- Universe rail with price + 24h % cells
- K-line top bar (price, 24h H/L/Vol/Bars, interval picker)
- Gate-style flat indicator strip below the chart (主图 / 副图)
- Per-subchart × close button at top-right of each pane
- Fixed total chart height (default 560 px) — adding subcharts
  compresses existing panes (matches gate.com)
- Pan-left infinite history loading (debounce + dedup)
- `scrollToRealTime` on initial data
- `localStorage:claw:chart-indicators` persistence — old selections
  carry over since the indicator names are unchanged

## Bundle impact

- klinecharts gone: −140 KB gzipped
- technicalindicators added: +50 KB gzipped
- lightweight-charts size unchanged (was already there)
- **Net: ~90 KB smaller**

## Adding a new indicator (going forward)

1. Create `src/chart/indicators/<NAME>.ts` exporting an
   `IndicatorDef` (compute function + render function).
2. Add it to the imports + `ALL` array in
   `src/chart/indicators/registry.ts`.
3. Done — `IndicatorBar` automatically lists it; the chart
   engine automatically renders it when toggled.

No changes to `KlineChart`, `IndicatorBar`, or
`chartIndicatorsStore` ever required.

## Verification

- `pnpm exec tsc --noEmit` ✅ clean
- `pnpm exec vitest run` ✅ **311/311** (was 299; +12 from
  registry + MA + MACD compute tests)
- Bundle: net 90 KB smaller after klinecharts removal
- No data migration needed; localStorage shape unchanged
