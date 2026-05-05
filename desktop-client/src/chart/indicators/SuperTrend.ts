// SuperTrend — ATR-based trend line (overlay). NEW vs klinecharts.
// Hand-rolled (technicalindicators ships ATR but not the SuperTrend
// composite; the formula is short).

import { ATR } from 'technicalindicators';
import type { IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface Opts { period: number; multiplier: number }

const def: IndicatorDef<Opts> = {
  name: 'SuperTrend',
  kind: 'overlay',
  defaults: { period: 10, multiplier: 3 },
  compute(candles, opts) {
    const atr = ATR.calculate({
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      close: candles.map((c) => c.close),
      period: opts.period,
    });
    const offset = candles.length - atr.length;

    const out: { time: UTCTimestamp; value: number; color: string }[] = [];
    let trend: 'up' | 'down' = 'up';
    let lastUpperBand = 0;
    let lastLowerBand = 0;
    for (let i = 0; i < atr.length; i++) {
      const c = candles[i + offset];
      const hl2 = (c.high + c.low) / 2;
      const upperBasic = hl2 + opts.multiplier * atr[i];
      const lowerBasic = hl2 - opts.multiplier * atr[i];
      const upperBand =
        i === 0 ||
        upperBasic < lastUpperBand ||
        candles[i + offset - 1].close > lastUpperBand
          ? upperBasic
          : lastUpperBand;
      const lowerBand =
        i === 0 ||
        lowerBasic > lastLowerBand ||
        candles[i + offset - 1].close < lastLowerBand
          ? lowerBasic
          : lastLowerBand;
      lastUpperBand = upperBand;
      lastLowerBand = lowerBand;
      // Trend flip
      if (trend === 'up' && c.close < lowerBand) trend = 'down';
      else if (trend === 'down' && c.close > upperBand) trend = 'up';
      const value = trend === 'up' ? lowerBand : upperBand;
      out.push({
        time: c.time as UTCTimestamp,
        value,
        color: trend === 'up' ? '#22C55E' : '#EF4444',
      });
    }
    return { series: { SuperTrend: out as never } };
  },
  render(api, result) {
    const line = api.addLine({ color: '#22C55E', lineWidth: 2, title: 'SuperTrend' });
    line.setData(
      (result.series.SuperTrend as unknown as Array<{ time: UTCTimestamp; value: number }>).map(
        (p) => ({ time: p.time, value: p.value }),
      ),
    );
    return { seriesHandles: [line], paneIndex: null };
  },
};
export default def;
