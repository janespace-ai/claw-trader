// VR — Volume Ratio (subchart). Hand-rolled.
//   AVS = Σ(vol where close > prev_close)
//   BVS = Σ(vol where close < prev_close)
//   CVS = Σ(vol where close == prev_close)
//   VR  = (AVS + 0.5 × CVS) / (BVS + 0.5 × CVS) × 100
import type { IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface Opts { period: number }
const def: IndicatorDef<Opts> = {
  name: 'VR',
  kind: 'subchart',
  defaults: { period: 26 },
  compute(candles, opts) {
    const period = opts.period;
    const out: number[] = [];
    for (let i = period; i < candles.length; i++) {
      let avs = 0;
      let bvs = 0;
      let cvs = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const v = candles[j].volume;
        const dc = candles[j].close - candles[j - 1].close;
        if (dc > 0) avs += v;
        else if (dc < 0) bvs += v;
        else cvs += v;
      }
      const num = avs + 0.5 * cvs;
      const den = bvs + 0.5 * cvs;
      out.push(den === 0 ? 0 : (num / den) * 100);
    }
    const offset = candles.length - out.length;
    return {
      series: {
        VR: out.map((v, i) => ({ time: candles[i + offset].time as UTCTimestamp, value: v })),
      },
    };
  },
  render(api, result) {
    const line = api.addLine({ color: '#F59E0B', lineWidth: 1, title: 'VR' });
    line.setData(result.series.VR);
    return { seriesHandles: [line], paneIndex: 0 };
  },
};
export default def;
