// BIAS — (close - SMA(N)) / SMA(N) * 100. Hand-rolled.
import { SMA } from 'technicalindicators';
import type { IndicatorDef, IndicatorResult } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

const COLORS = ['#A855F7', '#F59E0B', '#3B82F6'];
interface Opts { periods: number[] }
const def: IndicatorDef<Opts> = {
  name: 'BIAS',
  kind: 'subchart',
  defaults: { periods: [6, 12, 24] },
  compute(candles, opts) {
    const closes = candles.map((c) => c.close);
    const series: IndicatorResult['series'] = {};
    for (const period of opts.periods) {
      const sma = SMA.calculate({ period, values: closes });
      const offset = closes.length - sma.length;
      series[`BIAS${period}`] = sma.map((m, i) => ({
        time: candles[i + offset].time as UTCTimestamp,
        value: ((closes[i + offset] - m) / m) * 100,
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
    return { seriesHandles, paneIndex: 0 };
  },
};
export default def;
