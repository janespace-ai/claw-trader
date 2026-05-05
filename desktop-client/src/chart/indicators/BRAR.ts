// BRAR — BR + AR sentiment indicators (subchart). Hand-rolled.
//   AR = Σ(high - open) / Σ(open - low) × 100
//   BR = Σ(high - prev_close) / Σ(prev_close - low) × 100
import type { Candle, IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface Opts { period: number }

function computeAR(candles: Candle[], period: number): number[] {
  const out: number[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let num = 0;
    let den = 0;
    for (let j = i - period + 1; j <= i; j++) {
      num += Math.max(0, candles[j].high - candles[j].open);
      den += Math.max(0, candles[j].open - candles[j].low);
    }
    out.push(den === 0 ? 0 : (num / den) * 100);
  }
  return out;
}

function computeBR(candles: Candle[], period: number): number[] {
  const out: number[] = [];
  for (let i = period; i < candles.length; i++) {
    let num = 0;
    let den = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const prev = candles[j - 1].close;
      num += Math.max(0, candles[j].high - prev);
      den += Math.max(0, prev - candles[j].low);
    }
    out.push(den === 0 ? 0 : (num / den) * 100);
  }
  return out;
}

const def: IndicatorDef<Opts> = {
  name: 'BRAR',
  kind: 'subchart',
  defaults: { period: 26 },
  compute(candles, opts) {
    const ar = computeAR(candles, opts.period);
    const br = computeBR(candles, opts.period);
    const arOff = candles.length - ar.length;
    const brOff = candles.length - br.length;
    return {
      series: {
        BR: br.map((v, i) => ({ time: candles[i + brOff].time as UTCTimestamp, value: v })),
        AR: ar.map((v, i) => ({ time: candles[i + arOff].time as UTCTimestamp, value: v })),
      },
    };
  },
  render(api, result) {
    const br = api.addLine({ color: '#A855F7', lineWidth: 1, title: 'BR' });
    const ar = api.addLine({ color: '#F59E0B', lineWidth: 1, title: 'AR' });
    br.setData(result.series.BR);
    ar.setData(result.series.AR);
    return { seriesHandles: [br, ar], paneIndex: 0 };
  },
};
export default def;
