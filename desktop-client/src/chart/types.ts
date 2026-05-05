// Chart-engine type definitions.
//
// These types form the boundary between three layers:
//   1. KlineChart (React shell) — owns lifecycle + listens to stores
//   2. paneRenderer.ts          — wraps Lightweight Charts pane API
//   3. indicators/<NAME>.ts     — pure functions: compute() + render()
//
// Indicator authors see ONLY `Candle`, `IndicatorDef`, and
// `PaneRenderApi` — not Lightweight Charts directly.  This isolates
// us from upstream chart-library changes.

import type { ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts';

/** OHLCV bar — input to every indicator's compute(). */
export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Single point produced by an indicator at a given timestamp. */
export interface IndicatorPoint {
  time: UTCTimestamp;
  value: number;
}

/** Multi-line indicator output (e.g. BOLL: {up, mid, dn}). */
export interface IndicatorMultiPoint {
  time: UTCTimestamp;
  [field: string]: number | UTCTimestamp;
}

/** What an indicator returns from compute().  Renderer reads this. */
export interface IndicatorResult {
  /** Named series — each becomes one line/area/histogram on the pane. */
  series: Record<string, IndicatorPoint[]>;
}

export type LineSeriesHandle = ISeriesApi<'Line'>;
export type AreaSeriesHandle = ISeriesApi<'Area'>;
export type HistogramSeriesHandle = ISeriesApi<'Histogram'>;
export type AnySeriesHandle = ISeriesApi<SeriesType>;

/** Facade over a Lightweight Charts pane.  Indicators talk to this,
 *  not to the raw chart object — so the chart library is replaceable. */
export interface PaneRenderApi {
  addLine(opts: {
    color: string;
    lineWidth?: number;
    title?: string;
    /** When true (default true), shows the value chip on the right axis. */
    lastValueVisible?: boolean;
  }): LineSeriesHandle;

  addHistogram(opts: {
    color: string | ((point: IndicatorPoint) => string);
    base?: number;
    title?: string;
  }): HistogramSeriesHandle;

  addArea(opts: {
    lineColor: string;
    topColor: string;
    bottomColor: string;
    lineWidth?: number;
    title?: string;
  }): AreaSeriesHandle;
}

/** Returned by render().  Engine uses this to remove the indicator
 *  later. */
export interface RenderedIndicator {
  /** All Lightweight Charts series this indicator created.  Engine
   *  removes them via `chart.removeSeries(s)` when the indicator is
   *  toggled off. */
  seriesHandles: AnySeriesHandle[];
  /** Pane index; null for overlay (lives on candle pane = index 0). */
  paneIndex: number | null;
}

/** The contract every `src/chart/indicators/<NAME>.ts` must satisfy. */
export interface IndicatorDef<Opts extends object = object> {
  /** Display name + the registry key.  Must be unique across all
   *  indicator files. */
  name: string;

  /** Where the indicator paints:
   *   - 'overlay'  → on top of the candles (price scale)
   *   - 'subchart' → its own pane below the candles, sharing time axis
   */
  kind: 'overlay' | 'subchart';

  /** Default options applied when the indicator is toggled on with no
   *  user customization. */
  defaults: Opts;

  /** Pure: compute the indicator values from a candle series. */
  compute(candles: Candle[], opts: Opts): IndicatorResult;

  /** Render the computed values onto a pane.  MUST NOT touch
   *  Lightweight Charts directly — only via `api`. */
  render(api: PaneRenderApi, result: IndicatorResult): RenderedIndicator;
}
