# Release: workspace-market-depth-and-indicators

Follow-on to [workspace-three-zone-layout](./workspace-three-zone-layout.md).

## TL;DR

Closes the four "still feels skeletal" gaps in the new workspace
K-line panel:

- **Left rail** rows now show **price + 24h % change** (color-coded).
- **K-line top bar** shows **24h H / L / 成交额 / Bars** alongside
  price.
- **K-line history** is now **infinite scroll-left**: pan the chart
  left and older bars stream in.
- **Technical indicators** are real now: 25+ built-in indicators (MA
  / EMA / BOLL / SAR / VOL / MACD / KDJ / RSI / CCI / DMI / TRIX /
  OBV / WR / MTM / EMV / DMA / PSY / BBI / BIAS / BRAR / CR / VR /
  PVT / AO …) toggle-able via a "+ 指标" picker.

## Why

After workspace-three-zone-layout shipped, comparing to gate.com's
trade page showed our K-line was still placeholder-grade: no
indicators, no history, no market context.  This change fills those
gaps.

## What's new

### Left rail rows have market context

Each row shows: symbol on the left, price + 24h % stacked on the
right.  Magnitude-aware price formatting (BTC = `67,432.10`, DOGE
= `0.4123`, micro-caps = 6 decimals).  Falls back to `—` for
symbols without recent bars.  Backed by 2 new optional fields on the
`Symbol` schema (`last_price`, `change_24h_pct`) populated server-side
via a single LATERAL-JOIN query against the 5m klines hypertable.

### K-line top bar — full market summary

Adds a 2×2 grid next to the price block: `24h H · 24h L · 24h 成交额
· Bars`.  H/L derived locally from the last 288 × 5m bars; 成交额
pulled from the existing `getSymbolMetadata` endpoint.

### K-line library swap → klinecharts

The K-line viewer is now backed by [klinecharts](https://klinecharts.com)
(Apache 2.0) instead of `lightweight-charts` (which we kept for
EquityCurve / DrawdownCurve / MonthlyHeatmap — they don't need
indicators).

This swap unlocks:

- **Built-in indicators** — no more hand-rolled `computeRSI`.
- **Native pan-to-load-older history** via the `DataLoader` pattern
  (initial 200 bars, then 200 more each time the user pans within 20
  bars of the start, single-flight + dedup-guarded).
- **Multi-pane chart** — overlays paint on the price scale, subcharts
  stack vertically, all sharing the same time axis.

### Indicator picker

Right next to the interval picker, a `+ 指标` dropdown:

- Two sections: **叠加在主图** (overlays) + **独立子图** (subcharts).
- Search box filters across both lists.
- Subchart cap of **6** with an inline notice if you try to add a 7th.
- Selection persists per-user via `localStorage:claw:chart-indicators`
  (Zustand `persist` middleware).
- Defaults: `MA` overlay + `VOL` subchart.
- Each rendered subchart has a `×` close affordance.

## Telemetry

Pre-existing events continue (`workspace_load`, `focused_symbol_change`,
`tab_auto_switch`, `filtered_add`).  No new events in this release —
indicator selections live entirely client-side, by design.

## Rollout

No feature flag needed for this change — the layout topology is
unchanged, just enrichment.

**Backend**: deploys independently.  The new `Symbol` fields are
purely additive; old clients ignore them.

**Frontend**: no flag.  The chart library swap is internal — same
visual surface area.

**Rollback**: revert the merge.  Backend revert is a no-op (drop the
2 fields; frontend handles null).

## Migration notes

- `klinecharts` added to `desktop-client/package.json` (~140 KB
  gzipped).
- Hand-rolled `computeRSI` + `RsiSubchart.tsx` deleted (klinecharts
  ships RSI built-in).
- `KlineChart.tsx` API changed: now takes `{ symbol, interval,
  loadBars, height }` instead of `{ candles, trades, indicators,
  height }`.  Only caller is `SymbolKlinePane` — nothing else
  affected.
- 1 new Pencil frame `C3zfc` (`USW3Z+ · K线 · 多指标 · Dark`) at
  `(0, 9000)` in `docs/design/trader.pen`.

## Tests

`vitest run` → **297/297** passing (was 285; +12 new).
`tsc --noEmit` clean.  Go build/vet clean (test execution requires
Docker; covered by CI when available).
