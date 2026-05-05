// BBI — Bull-Bear Index = (MA3 + MA6 + MA12 + MA24) / 4 (overlay).
// Hand-rolled — technicalindicators doesn't ship BBI.

import { SMA } from 'technicalindicators';
import type { IndicatorDef, IndicatorResult } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface Opts { periods: number[] }

const def: IndicatorDef<Opts> = {
  name: 'BBI',
  kind: 'overlay',
  defaults: { periods: [3, 6, 12, 24] },
  compute(candles, opts) {
    const closes = candles.map((c) => c.close);
    const arrs = opts.periods.map((p) => SMA.calculate({ period: p, values: closes }));
    // Align: take last N where N = min length across all 4 SMAs.
    const minLen = Math.min(...arrs.map((a) => a.length));
    const aligned = arrs.map((a) => a.slice(a.length - minLen));
    const offset = closes.length - minLen;
    const out: { time: UTCTimestamp; value: number }[] = [];
    for (let i = 0; i < minLen; i++) {
      const sum = aligned.reduce((s, a) => s + a[i], 0);
      out.push({
        time: candles[i + offset].time as UTCTimestamp,
        value: sum / opts.periods.length,
      });
    }
    return { series: { BBI: out } };
  },
  render(api, result) {
    const line = api.addLine({ color: '#10B981', lineWidth: 1, title: 'BBI' });
    line.setData(result.series.BBI);
    return { seriesHandles: [line], paneIndex: null };
  },
};
export default def;
