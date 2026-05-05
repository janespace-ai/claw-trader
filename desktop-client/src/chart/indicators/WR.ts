// WR — Williams %R (subchart).
import { WilliamsR } from 'technicalindicators';
import type { IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface Opts { period: number }
const def: IndicatorDef<Opts> = {
  name: 'WR',
  kind: 'subchart',
  defaults: { period: 14 },
  compute(candles, opts) {
    const values = WilliamsR.calculate({
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      close: candles.map((c) => c.close),
      period: opts.period,
    });
    const offset = candles.length - values.length;
    return {
      series: {
        WR: values.map((v, i) => ({ time: candles[i + offset].time as UTCTimestamp, value: v })),
      },
    };
  },
  render(api, result) {
    const line = api.addLine({ color: '#A855F7', lineWidth: 1, title: 'WR' });
    line.setData(result.series.WR);
    return { seriesHandles: [line], paneIndex: 0 };
  },
};
export default def;
