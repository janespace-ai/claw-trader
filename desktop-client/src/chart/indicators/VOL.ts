// VOL — Volume bars subchart, color-tinted by candle direction.
//
// IMPORTANT: per-bar colors are baked into compute()'s output (real
// hex), not translated inside render().  KlineChart.ingestBars()
// re-renders by calling series.setData() with the raw compute output
// on every bar update — so compute() MUST emit lightweight-charts'
// native shape ({time, value, color: '#xxxxxx'}).  Putting placeholder
// tokens here and translating in render() leaves the histogram with
// invalid color strings on every reload → all bars paint black.

import type { Candle, IndicatorDef, IndicatorResult } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

const UP_COLOR = '#22C55E';
const DOWN_COLOR = '#EF4444';

const def: IndicatorDef<object> = {
  name: 'VOL',
  kind: 'subchart',
  defaults: {},

  compute(candles: Candle[]): IndicatorResult {
    const points = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? UP_COLOR : DOWN_COLOR,
    }));
    return { series: { VOL: points as never } };
  },

  render(api, result) {
    const hist = api.addHistogram({
      color: UP_COLOR, // base color; per-point colors override via data
      base: 0,
      title: 'VOL',
    });
    hist.setData(result.series.VOL as never);
    return { seriesHandles: [hist], paneIndex: 0 /* engine remaps */ };
  },
};

export default def;
