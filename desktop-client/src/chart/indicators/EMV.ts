// EMV — Ease of Movement (subchart). Hand-rolled.
//   EMV = ((H+L)/2 - (H_prev+L_prev)/2) × (H-L) / volume
//   MAEMV = SMA(EMV, M)
import { SMA } from 'technicalindicators';
import type { IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface Opts { period: number; signal: number }
const def: IndicatorDef<Opts> = {
  name: 'EMV',
  kind: 'subchart',
  defaults: { period: 14, signal: 9 },
  compute(candles, opts) {
    const raw: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const cur = (candles[i].high + candles[i].low) / 2;
      const prev = (candles[i - 1].high + candles[i - 1].low) / 2;
      const range = candles[i].high - candles[i].low;
      const v = candles[i].volume;
      raw.push(v === 0 ? 0 : ((cur - prev) * range) / v);
    }
    // Sum over period for the EMV value at each bar.
    const emv: number[] = [];
    for (let i = opts.period - 1; i < raw.length; i++) {
      let s = 0;
      for (let j = i - opts.period + 1; j <= i; j++) s += raw[j];
      emv.push(s);
    }
    const ma = SMA.calculate({ period: opts.signal, values: emv });
    const emvOff = candles.length - emv.length;
    const maOff = candles.length - ma.length;
    return {
      series: {
        EMV: emv.map((v, i) => ({ time: candles[i + emvOff].time as UTCTimestamp, value: v })),
        MAEMV: ma.map((v, i) => ({ time: candles[i + maOff].time as UTCTimestamp, value: v })),
      },
    };
  },
  render(api, result) {
    const e = api.addLine({ color: '#3B82F6', lineWidth: 1, title: 'EMV' });
    const m = api.addLine({ color: '#F59E0B', lineWidth: 1, title: 'MAEMV' });
    e.setData(result.series.EMV);
    m.setData(result.series.MAEMV);
    return { seriesHandles: [e, m], paneIndex: 0 };
  },
};
export default def;
