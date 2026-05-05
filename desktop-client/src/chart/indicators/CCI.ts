import { CCI } from 'technicalindicators';
import type { IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface Opts { period: number }
const def: IndicatorDef<Opts> = {
  name: 'CCI',
  kind: 'subchart',
  defaults: { period: 20 },
  compute(candles, opts) {
    const values = CCI.calculate({
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      close: candles.map((c) => c.close),
      period: opts.period,
    });
    const offset = candles.length - values.length;
    return {
      series: {
        CCI: values.map((v, i) => ({ time: candles[i + offset].time as UTCTimestamp, value: v })),
      },
    };
  },
  render(api, result) {
    const line = api.addLine({ color: '#A855F7', lineWidth: 1, title: 'CCI' });
    line.setData(result.series.CCI);
    return { seriesHandles: [line], paneIndex: 0 };
  },
};
export default def;
