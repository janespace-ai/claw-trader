// AVP — Average Volume Price = cumulative Σ(typical_price × vol) / Σ(vol).
// Overlay.  Hand-rolled (klinecharts called this "AVP", different from
// session-VWAP).

import type { IndicatorDef, IndicatorResult } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

const def: IndicatorDef<object> = {
  name: 'AVP',
  kind: 'overlay',
  defaults: {},
  compute(candles) {
    let cumPV = 0;
    let cumV = 0;
    const out: { time: UTCTimestamp; value: number }[] = [];
    for (const c of candles) {
      const typical = (c.high + c.low + c.close) / 3;
      cumPV += typical * c.volume;
      cumV += c.volume;
      if (cumV > 0) {
        out.push({ time: c.time as UTCTimestamp, value: cumPV / cumV });
      }
    }
    return { series: { AVP: out } };
  },
  render(api, result) {
    const line = api.addLine({ color: '#06B6D4', lineWidth: 2, title: 'AVP' });
    line.setData(result.series.AVP);
    return { seriesHandles: [line], paneIndex: null };
  },
};
export default def;
