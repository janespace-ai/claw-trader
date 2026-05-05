// MTM — Momentum: close - close[N] (subchart). Hand-rolled.
import { SMA } from 'technicalindicators';
import type { IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface Opts { period: number; signal: number }
const def: IndicatorDef<Opts> = {
  name: 'MTM',
  kind: 'subchart',
  defaults: { period: 12, signal: 6 },
  compute(candles, opts) {
    const mtm: number[] = [];
    for (let i = opts.period; i < candles.length; i++) {
      mtm.push(candles[i].close - candles[i - opts.period].close);
    }
    const ma = SMA.calculate({ period: opts.signal, values: mtm });
    const mtmOff = candles.length - mtm.length;
    const maOff = candles.length - ma.length;
    return {
      series: {
        MTM: mtm.map((v, i) => ({ time: candles[i + mtmOff].time as UTCTimestamp, value: v })),
        MAMTM: ma.map((v, i) => ({ time: candles[i + maOff].time as UTCTimestamp, value: v })),
      },
    };
  },
  render(api, result) {
    const m = api.addLine({ color: '#A855F7', lineWidth: 1, title: 'MTM' });
    const ma = api.addLine({ color: '#F59E0B', lineWidth: 1, title: 'MAMTM' });
    m.setData(result.series.MTM);
    ma.setData(result.series.MAMTM);
    return { seriesHandles: [m, ma], paneIndex: 0 };
  },
};
export default def;
