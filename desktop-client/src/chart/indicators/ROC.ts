// ROC — Rate of Change (subchart).
import { ROC } from 'technicalindicators';
import type { IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface Opts { period: number }
const def: IndicatorDef<Opts> = {
  name: 'ROC',
  kind: 'subchart',
  defaults: { period: 12 },
  compute(candles, opts) {
    const values = ROC.calculate({
      values: candles.map((c) => c.close),
      period: opts.period,
    });
    const offset = candles.length - values.length;
    return {
      series: {
        ROC: values.map((v, i) => ({ time: candles[i + offset].time as UTCTimestamp, value: v })),
      },
    };
  },
  render(api, result) {
    const line = api.addLine({ color: '#3B82F6', lineWidth: 1, title: 'ROC' });
    line.setData(result.series.ROC);
    return { seriesHandles: [line], paneIndex: 0 };
  },
};
export default def;
