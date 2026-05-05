// TRIX — Triple-Exponential Average rate of change (subchart).
import { TRIX, SMA } from 'technicalindicators';
import type { IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface Opts { period: number; signal: number }
const def: IndicatorDef<Opts> = {
  name: 'TRIX',
  kind: 'subchart',
  defaults: { period: 12, signal: 9 },
  compute(candles, opts) {
    const closes = candles.map((c) => c.close);
    const trix = TRIX.calculate({ values: closes, period: opts.period });
    const matrix = SMA.calculate({ values: trix, period: opts.signal });
    const trixOff = closes.length - trix.length;
    const matrixOff = closes.length - matrix.length;
    return {
      series: {
        TRIX: trix.map((v, i) => ({ time: candles[i + trixOff].time as UTCTimestamp, value: v })),
        MATRIX: matrix.map((v, i) => ({ time: candles[i + matrixOff].time as UTCTimestamp, value: v })),
      },
    };
  },
  render(api, result) {
    const t = api.addLine({ color: '#A855F7', lineWidth: 1, title: 'TRIX' });
    const m = api.addLine({ color: '#F59E0B', lineWidth: 1, title: 'MATRIX' });
    t.setData(result.series.TRIX);
    m.setData(result.series.MATRIX);
    return { seriesHandles: [t, m], paneIndex: 0 };
  },
};
export default def;
