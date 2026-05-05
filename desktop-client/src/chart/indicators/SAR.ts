// SAR — Parabolic Stop and Reverse (overlay dots).

import { PSAR } from 'technicalindicators';
import type { IndicatorDef, IndicatorResult } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface Opts { step: number; max: number }

const def: IndicatorDef<Opts> = {
  name: 'SAR',
  kind: 'overlay',
  defaults: { step: 0.02, max: 0.2 },
  compute(candles, opts) {
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const values = PSAR.calculate({
      high: highs,
      low: lows,
      step: opts.step,
      max: opts.max,
    });
    const offset = candles.length - values.length;
    return {
      series: {
        SAR: values.map((v, i) => ({
          time: candles[i + offset].time as UTCTimestamp,
          value: v,
        })),
      },
    };
  },
  render(api, result) {
    // Render as a thin line so the dots are visible without being heavy.
    const line = api.addLine({ color: '#A855F7', lineWidth: 1, title: 'SAR' });
    line.setData(result.series.SAR);
    return { seriesHandles: [line], paneIndex: null };
  },
};
export default def;
