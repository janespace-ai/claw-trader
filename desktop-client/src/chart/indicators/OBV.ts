// OBV — On Balance Volume (subchart).
import { OBV } from 'technicalindicators';
import type { IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

const def: IndicatorDef<object> = {
  name: 'OBV',
  kind: 'subchart',
  defaults: {},
  compute(candles) {
    const values = OBV.calculate({
      close: candles.map((c) => c.close),
      volume: candles.map((c) => c.volume),
    });
    const offset = candles.length - values.length;
    return {
      series: {
        OBV: values.map((v, i) => ({ time: candles[i + offset].time as UTCTimestamp, value: v })),
      },
    };
  },
  render(api, result) {
    const line = api.addLine({ color: '#06B6D4', lineWidth: 1, title: 'OBV' });
    line.setData(result.series.OBV);
    return { seriesHandles: [line], paneIndex: 0 };
  },
};
export default def;
