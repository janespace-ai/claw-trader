# Design — Chart Engine: TradingView Lightweight Charts v5 + technicalindicators

## Context

We landed `workspace-market-depth-and-indicators` on **klinecharts**
because in early 2025 it was the only Apache-2.0 chart library with
built-in indicators and multi-pane.  Lightweight Charts v5 (released
mid-2025) added native multi-pane via `chart.addPane()`, removing
klinecharts' main differentiator.  Combined with the user's
preference for the TradingView visual idiom, the trade-off now
favors Lightweight Charts + a separate calc library.

Reference: gate.com's per-symbol trade page uses TradingView's
hosted widget; our look will be similar after this swap.

## Goals / Non-Goals

**Goals:**
- Visual fidelity: match (or exceed) the chart polish users
  recognise from TradingView.
- Indicator coverage: ≥ 31 indicators (27 from klinecharts + 4
  high-value additions).
- Same UX as today (per-pane × close, fixed total height, flat
  indicator bar, pan-left history, scroll-to-real-time on init).
- Net bundle size reduction (drop the heavier klinecharts).

**Non-Goals:**
- Drawing tools.
- WebSocket real-time ticks.
- Per-indicator parameter UI (sliders).  Defaults only.
- Pine Script support.

## Decisions

### D1: Upgrade to Lightweight Charts v5 (not stay on v4)

**Choice:** `pnpm add lightweight-charts@^5` — bumps the existing
v4.2.3 to v5.x.

**Rationale:**
- v5 has native `chart.addPane()` for multi-pane.  v4 requires
  stacking N+1 chart instances and manually syncing
  `subscribeVisibleTimeRangeChange` — ~400 lines of orchestration
  vs ~80 with v5.
- The dep is shared with EquityCurve / DrawdownCurve /
  MonthlyHeatmap — we can't multi-version cleanly.  One swap, one
  upgrade window.

**Alternative considered:** Stay on v4 and fake multi-pane via
synced chart instances.  Rejected: too much code for a problem the
upstream library has already solved.

**Risk:** v5 has breaking API changes (new series creation pattern).
Mitigation: documented migration in this design + Group 2 of the
tasks file does it explicitly.

### D2: `technicalindicators` for calc, Lightweight Charts for paint

**Choice:** Use `technicalindicators` (MIT, ~500k weekly downloads)
purely as a math library — its outputs are arrays of numbers
indexed by candle.  We pipe those arrays into Lightweight Charts
series via the standard `series.setData([{time, value}, ...])` API.

**Rationale:**
- Separation: math is pure, drawing is pure, easier to test each.
- `technicalindicators` covers everything klinecharts ships PLUS
  the 4 we want to add (VWAP, SuperTrend, Ichimoku, Keltner).
- Streaming-friendly — we can incrementally update on new bars later.

**Alternative considered:** Hand-write each indicator (like the old
`computeRSI` we deleted).  Rejected — 31 × ~30 LOC = ~1000 LOC of
math we'd be writing+testing+maintaining.

### D3: Indicator Registry pattern

**Choice:** A new `src/chart/indicators/` directory with:
- `registry.ts` — exports `INDICATOR_REGISTRY: Record<name,
  IndicatorDef>` and helper functions `getOverlayIndicators()`,
  `getSubchartIndicators()`.
- One file per indicator: `MA.ts`, `EMA.ts`, …, `MACD.ts`, …,
  `Ichimoku.ts`.
- Each file exports an `IndicatorDef`:
  ```ts
  interface IndicatorDef {
    name: string;            // 'MA', 'BOLL', 'MACD', ...
    kind: 'overlay' | 'subchart';
    defaults: Record<string, unknown>;
    compute(candles: Candle[], opts: object): IndicatorValue[];
    render(api: PaneRenderApi, values: IndicatorValue[]): RenderedSeries;
  }
  ```
- `KlineChart` reads the registry, never knows the names of any
  specific indicator.

**Rationale:**
- Adding a new indicator = 1 file + 1 registry line.  No
  KlineChart edits.
- Tests can target individual indicators in isolation.
- Re-categorization (overlay → subchart or vice versa) is a 1-line
  change in the indicator's own file.

**Alternative considered:** Keep the hardcoded `OVERLAY_INDICATORS`
/ `SUBCHART_INDICATORS` arrays.  Rejected — we have to write the
compute + render logic per indicator anyway, so the registry costs
nothing extra and gives us per-indicator isolation.

### D4: PaneRenderApi abstraction

**Choice:** A thin facade in `src/chart/paneRenderer.ts`:
```ts
interface PaneRenderApi {
  addLine(opts: LineSeriesOpts): ISeriesApi<'Line'>;
  addHistogram(opts: HistogramSeriesOpts): ISeriesApi<'Histogram'>;
  addArea(opts: AreaSeriesOpts): ISeriesApi<'Area'>;
  // …
}
```

Each indicator file's `render()` calls these methods rather than
talking to Lightweight Charts directly.

**Rationale:**
- Lightweight Charts v5's `addSeries(SeriesType, opts, paneIndex)`
  call gets verbose; the facade keeps indicator files focused on
  the visual shape.
- Future v5→v6 migration (or chart-library swap) only touches
  `paneRenderer.ts`, not 31 indicator files.

### D5: Fixed total height — same UX as before

**Choice:** Container height is set via the `height` prop (default
560 px).  Adding a subchart **compresses** existing panes
(Lightweight Charts v5 distributes available height across panes
based on their `paneIndex` ordering).

**Rationale:** Same reasoning as the prior change — gate.com does
this, user explicitly chose this in the prior round
(`workspace-market-depth-and-indicators` Group 13).

### D6: Pan-to-load-older history via `subscribeVisibleTimeRangeChange`

**Choice:** Subscribe to `chart.timeScale().subscribeVisibleTimeRangeChange`.
When `range.from` approaches the loaded oldest timestamp, fetch
200 older bars via the existing `loadBars` callback.  Same
debounce + single-flight + dedup rules as before.

**Rationale:** This is the canonical Lightweight Charts pattern;
v4 supported it too.  We just port the existing logic.

### D7: Migrate companion components in the same PR

**Choice:** Migrate `EquityCurve` / `DrawdownCurve` /
`MonthlyHeatmap` to v5 in Group 2 of the tasks file, BEFORE we
touch `KlineChart` (Group 3).  Otherwise the build is broken
between the v4 → v5 dep bump and the rewrites.

**Rationale:** Atomic upgrade is the correct sequencing.  Cannot
have the dep at v5 with v4-style call sites.

### D8: 4 NEW indicators

**Choice:** Add VWAP, SuperTrend, Ichimoku Cloud, Keltner Channels —
all 4 are common in crypto + traditional finance and absent from
klinecharts.

| Indicator | Kind | Library function |
|---|---|---|
| VWAP | overlay | `technicalindicators.VWAP` |
| SuperTrend | overlay | `technicalindicators.SuperTrend` |
| Ichimoku Cloud | overlay (multi-line + filled cloud) | `technicalindicators.IchimokuCloud` |
| Keltner Channels | overlay | hand-rolled (KC = EMA ± multiplier × ATR) using `technicalindicators.EMA` + `.ATR` |

**Rationale:** Keep the addition surgical — 4 indicators that don't
overlap with anything ported from klinecharts and that crypto
strategies actually use.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Lightweight Charts v5's API has breaking changes from v4. | Group 2 explicitly migrates the 3 existing components to v5; checked into a single commit so the build never lives in an in-between state. |
| `technicalindicators` is CommonJS-first; Vite/ESM compat may need a shim. | Test in Group 1 immediately after install; if needed add `optimizeDeps.include` in `vite.config.ts`. |
| The new `chart/` directory introduces cross-cutting structure changes. | All files isolated under `src/chart/`; `KlineChart.tsx` is the only consumer; easy to rip out if the swap regrets. |
| Visual regressions on the existing playwright snapshots (if any cover EquityCurve etc). | Run snapshot tests; refresh approved baselines. |
| 31 indicators × custom render code = surface area for bugs. | One file per indicator + per-indicator unit test for the calc layer; render layer is a thin Lightweight Charts API call so most bugs surface as visual rather than logical. |
| Bundling `technicalindicators` into Electron renderer might pull in stream/Buffer polyfills. | Spot-check the dev build size after install; if bloated, switch to `indicatorts` (TS-native equivalent). |

## Migration Plan

1. **Group 1**: install deps, bump lightweight-charts, prove `tsc`
   compiles after the dep bump (will reveal v5 breaking calls).
2. **Group 2**: migrate EquityCurve / DrawdownCurve /
   MonthlyHeatmap to v5 — fix every `addCandlestickSeries` /
   `addLineSeries` etc call.  Verify their visual snapshots.
3. **Group 3**: build the new `KlineChart` + `paneRenderer` + 31
   indicator files.  Old klinecharts-backed `KlineChart` deleted at
   the END of this group.
4. **Group 4**: registry — wire indicator names from registry into
   `IndicatorBar`.  Drop the hardcoded constants in
   `chartIndicatorsStore`.
5. **Group 5**: tests + cleanup.
6. **Group 6**: remove `klinecharts` from `package.json`, update
   release notes.

**Rollback**: revert the merge.  Single PR, atomic.

## Open Questions

- **Should we expose the same `loadBars` API to the parent**, or
  change shape now while we're rewriting?  Tentative: keep same
  shape (`{symbol, interval, type, timestamp}` → `{bars, hasMoreBackward}`)
  since the parent (`SymbolKlinePane`) shouldn't need to change.
- **Cap the indicator catalog at 31, or let users add custom
  computed series?**  Out of scope for v1; future change can add
  a "register your own indicator" surface.
- **Heikin-Ashi candle mode** — not an indicator but a candle
  re-render.  Skip for v1; lightweight-charts doesn't ship it as
  a series type.  Could be a future toggle on the candle series.
