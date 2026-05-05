// RSI(6, 12, 24) — three-period RSI lines (subchart).

import { RSI as TIRSI } from 'technicalindicators';
import type { Candle, IndicatorDef, IndicatorResult } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

const COLORS = ['#A855F7', '#F59E0B', '#3B82F6'];

interface RSIOpts {
  periods: number[];
}

const def: IndicatorDef<RSIOpts> = {
  name: 'RSI',
  kind: 'subchart',
  defaults: { periods: [6, 12, 24] },

  compute(candles, opts) {
    const closes = candles.map((c) => c.close);
    const series: IndicatorResult['series'] = {};
    for (const period of opts.periods) {
      const values = TIRSI.calculate({ period, values: closes });
      const offset = closes.length - values.length;
      series[`RSI${period}`] = values.map((v, i) => ({
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
    return { seriesHandles, paneIndex: 0 };
  },
};

export default def;
