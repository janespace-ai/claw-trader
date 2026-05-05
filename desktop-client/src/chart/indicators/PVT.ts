// PVT — Price-Volume Trend (subchart). Hand-rolled.
//   PVT[i] = PVT[i-1] + ((close - prev_close) / prev_close) × volume
import type { IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

const def: IndicatorDef<object> = {
  name: 'PVT',
  kind: 'subchart',
  defaults: {},
  compute(candles) {
    const out: { time: UTCTimestamp; value: number }[] = [];
    let pvt = 0;
    for (let i = 1; i < candles.length; i++) {
      const prev = candles[i - 1].close;
      if (prev !== 0) {
        pvt += ((candles[i].close - prev) / prev) * candles[i].volume;
      }
      out.push({ time: candles[i].time as UTCTimestamp, value: pvt });
    }
    return { series: { PVT: out } };
  },
  render(api, result) {
    const line = api.addLine({ color: '#06B6D4', lineWidth: 1, title: 'PVT' });
    line.setData(result.series.PVT);
    return { seriesHandles: [line], paneIndex: 0 };
  },
};
export default def;
