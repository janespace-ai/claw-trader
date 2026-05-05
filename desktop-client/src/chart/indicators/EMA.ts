import { EMA } from 'technicalindicators';
import type { IndicatorDef, IndicatorResult } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

const COLORS = ['#F59E0B', '#3B82F6', '#A855F7', '#10B981'];

interface Opts { periods: number[] }

const def: IndicatorDef<Opts> = {
  name: 'EMA',
  kind: 'overlay',
  defaults: { periods: [12, 26, 50] },
  compute(candles, opts) {
    const closes = candles.map((c) => c.close);
    const series: IndicatorResult['series'] = {};
    for (const period of opts.periods) {
      const values = EMA.calculate({ period, values: closes });
      const offset = closes.length - values.length;
      series[`EMA${period}`] = values.map((v, i) => ({
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
      const line = api.addLine({ color: COLORS[i % COLORS.length], lineWidth: 1, title: name });
      line.setData(points);
      seriesHandles.push(line);
      i++;
    }
    return { seriesHandles, paneIndex: null };
  },
};
export default def;
