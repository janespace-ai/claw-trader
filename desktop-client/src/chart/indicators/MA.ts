// MA — Simple Moving Averages (multi-period overlay).
//
// Default: 5/10/30/60-period SMAs painted on the candle pane.
// `technicalindicators` ships SMA but only single-period — we call
// it once per period.

import { SMA } from 'technicalindicators';
import type { Candle, IndicatorDef, IndicatorResult } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

const COLORS = ['#F59E0B', '#3B82F6', '#A855F7', '#10B981'];

interface MAOpts {
  periods: number[];
}

const def: IndicatorDef<MAOpts> = {
  name: 'MA',
  kind: 'overlay',
  defaults: { periods: [5, 10, 30, 60] },

  compute(candles, opts) {
    const closes = candles.map((c) => c.close);
    const series: IndicatorResult['series'] = {};
    for (const period of opts.periods) {
      const values = SMA.calculate({ period, values: closes });
      // SMA output starts at index `period - 1` of the input.
      const offset = closes.length - values.length;
      series[`MA${period}`] = values.map((v, i) => ({
        time: candles[i + offset].time as UTCTimestamp,
        value: v,
      }));
    }
    return { series };
  },

  render(api, result) {
    const seriesHandles = [];
    let i = 0;
    for (const [name, points] of Object.entries(result.series)) {
      const line = api.addLine({
        color: COLORS[i % COLORS.length],
        lineWidth: 1,
        title: name,
      });
      line.setData(points);
      seriesHandles.push(line);
      i++;
    }
    return { seriesHandles, paneIndex: null };
  },
};

export default def;
