// SMA — Wilder Smoothed Moving Average (overlay).
// Hand-rolled: technicalindicators ships SMA = "Simple" not "Smoothed".

import type { IndicatorDef, IndicatorResult } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

const COLORS = ['#F59E0B', '#3B82F6', '#A855F7'];

interface Opts { periods: number[] }

function wilderSMA(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]) / period;
    out.push(prev);
  }
  return out;
}

const def: IndicatorDef<Opts> = {
  name: 'SMA',
  kind: 'overlay',
  defaults: { periods: [10, 30] },
  compute(candles, opts) {
    const closes = candles.map((c) => c.close);
    const series: IndicatorResult['series'] = {};
    for (const period of opts.periods) {
      const values = wilderSMA(closes, period);
      const offset = closes.length - values.length;
      series[`SMA${period}`] = values.map((v, i) => ({
        time: candles[i + offset].time as UTCTimestamp,
        value: v,
      }));
    }
    return { series };
  },
  render(api, result) {
    const seriesHandles = [];
    let i = 0;
    for (const [name, points] of Object.entries(result.series)) {
      const line = api.addLine({ color: COLORS[i % COLORS.length], lineWidth: 1, title: name });
      line.setData(points);
      seriesHandles.push(line);
      i++;
    }
    return { seriesHandles, paneIndex: null };
  },
};
export default def;
