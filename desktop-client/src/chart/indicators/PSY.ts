// PSY — Psychological line: count of up-closes / N × 100. Hand-rolled.
import type { IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface Opts { period: number }
const def: IndicatorDef<Opts> = {
  name: 'PSY',
  kind: 'subchart',
  defaults: { period: 12 },
  compute(candles, opts) {
    const period = opts.period;
    const out: number[] = [];
    for (let i = period; i < candles.length; i++) {
      let ups = 0;
      for (let j = i - period + 1; j <= i; j++) {
        if (candles[j].close > candles[j - 1].close) ups++;
      }
      out.push((ups / period) * 100);
    }
    const offset = candles.length - out.length;
    return {
      series: {
        PSY: out.map((v, i) => ({ time: candles[i + offset].time as UTCTimestamp, value: v })),
      },
    };
  },
  render(api, result) {
    const line = api.addLine({ color: '#A855F7', lineWidth: 1, title: 'PSY' });
    line.setData(result.series.PSY);
    return { seriesHandles: [line], paneIndex: 0 };
  },
};
export default def;
