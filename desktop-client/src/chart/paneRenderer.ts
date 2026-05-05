// paneRenderer — thin facade over Lightweight Charts v5 pane API.
//
// Indicators receive a PaneRenderApi instead of raw chart access so:
//   1. Indicator files don't import from `lightweight-charts`.
//   2. Future chart-library swaps only touch this file.
//   3. Color / opts shapes are normalized to one place.

import {
  AreaSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
} from 'lightweight-charts';
import type {
  AnySeriesHandle,
  AreaSeriesHandle,
  HistogramSeriesHandle,
  IndicatorPoint,
  LineSeriesHandle,
  PaneRenderApi,
} from './types';

/**
 * Build a PaneRenderApi bound to a specific pane index of a chart.
 *
 * Returned `series` array is mutated as the api's add* methods are
 * called, so the engine can reference it for removal.
 */
export function createPaneRenderApi(
  chart: IChartApi,
  paneIndex: number,
  series: AnySeriesHandle[],
): PaneRenderApi {
  return {
    addLine(opts) {
      const s: LineSeriesHandle = chart.addSeries(
        LineSeries,
        {
          color: opts.color,
          lineWidth: (opts.lineWidth ?? 2) as 1 | 2 | 3 | 4,
          title: opts.title,
          priceLineVisible: false,
          lastValueVisible: opts.lastValueVisible ?? true,
        },
        paneIndex,
      );
      series.push(s);
      return s;
    },

    addHistogram(opts) {
      // Lightweight Charts v5 doesn't support a per-point color
      // function natively on histogram series — but each data point
      // carries its own optional `color`.  Indicators that need
      // per-bar coloring (e.g. MACD histogram, VOL bars) should
      // pass `color: '__per_point__'` here and embed colors in
      // their data via .setData([{time, value, color}]).
      const baseColor =
        typeof opts.color === 'function'
          ? // resolve once for the default; per-point colors come from data
            (opts.color({
              time: 0 as IndicatorPoint['time'],
              value: 0,
            }) as string)
          : opts.color;
      const s: HistogramSeriesHandle = chart.addSeries(
        HistogramSeries,
        {
          color: baseColor,
          base: opts.base ?? 0,
          title: opts.title,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      series.push(s);
      return s;
    },

    addArea(opts) {
      const s: AreaSeriesHandle = chart.addSeries(
        AreaSeries,
        {
          lineColor: opts.lineColor,
          topColor: opts.topColor,
          bottomColor: opts.bottomColor,
          lineWidth: (opts.lineWidth ?? 2) as 1 | 2 | 3 | 4,
          title: opts.title,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      series.push(s);
      return s;
    },
  };
}
