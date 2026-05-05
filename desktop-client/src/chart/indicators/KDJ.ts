// KDJ — Stochastic-derived K/D/J lines (subchart).
// Hand-rolled because technicalindicators.Stochastic gives K and D
// only; J = 3K - 2D.

import type { Candle, IndicatorDef, IndicatorResult } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface Opts { period: number; signalPeriod: number }

function rsv(candles: Candle[], period: number): number[] {
  const out: number[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const win = candles.slice(i - period + 1, i + 1);
    const hi = Math.max(...win.map((c) => c.high));
    const lo = Math.min(...win.map((c) => c.low));
    const cls = candles[i].close;
    out.push(hi === lo ? 50 : ((cls - lo) / (hi - lo)) * 100);
  }
  return out;
}

const def: IndicatorDef<Opts> = {
  name: 'KDJ',
  kind: 'subchart',
  defaults: { period: 9, signalPeriod: 3 },
  compute(candles, opts) {
    const rsvVals = rsv(candles, opts.period);
    const k: number[] = [];
    const d: number[] = [];
    let prevK = 50;
    let prevD = 50;
    for (let i = 0; i < rsvVals.length; i++) {
      const ki = (2 / 3) * prevK + (1 / 3) * rsvVals[i];
      const di = (2 / 3) * prevD + (1 / 3) * ki;
      k.push(ki);
      d.push(di);
      prevK = ki;
      prevD = di;
    }
    const offset = candles.length - rsvVals.length;
    const time = (i: number) => candles[i + offset].time as UTCTimestamp;
    return {
      series: {
        K: k.map((v, i) => ({ time: time(i), value: v })),
        D: d.map((v, i) => ({ time: time(i), value: v })),
        J: k.map((v, i) => ({ time: time(i), value: 3 * v - 2 * d[i] })),
      },
    };
  },
  render(api, result) {
    const k = api.addLine({ color: '#3B82F6', lineWidth: 1, title: 'K' });
    const d = api.addLine({ color: '#F59E0B', lineWidth: 1, title: 'D' });
    const j = api.addLine({ color: '#A855F7', lineWidth: 1, title: 'J' });
    k.setData(result.series.K);
    d.setData(result.series.D);
    j.setData(result.series.J);
    return { seriesHandles: [k, d, j], paneIndex: 0 };
  },
};
export default def;
