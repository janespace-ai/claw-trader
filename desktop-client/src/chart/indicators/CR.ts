// CR — Middle-Intent indicator (subchart). Hand-rolled.
//   CR = Σ(high - mid) / Σ(mid - low) × 100, where mid = (high+low+close)/3 of prev bar.
import type { IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface Opts { period: number }
const def: IndicatorDef<Opts> = {
  name: 'CR',
  kind: 'subchart',
  defaults: { period: 26 },
  compute(candles, opts) {
    const out: number[] = [];
    const period = opts.period;
    for (let i = period; i < candles.length; i++) {
      let num = 0;
      let den = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const prev = candles[j - 1];
        const mid = (prev.high + prev.low + prev.close) / 3;
        num += Math.max(0, candles[j].high - mid);
        den += Math.max(0, mid - candles[j].low);
      }
      out.push(den === 0 ? 0 : (num / den) * 100);
    }
    const offset = candles.length - out.length;
    return {
      series: {
        CR: out.map((v, i) => ({ time: candles[i + offset].time as UTCTimestamp, value: v })),
      },
    };
  },
  render(api, result) {
    const line = api.addLine({ color: '#06B6D4', lineWidth: 1, title: 'CR' });
    line.setData(result.series.CR);
    return { seriesHandles: [line], paneIndex: 0 };
  },
};
export default def;
