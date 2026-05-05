// VWAP — Volume-Weighted Average Price (overlay).  NEW vs klinecharts.
//
// `technicalindicators.VWAP` computes session-style VWAP: rolling
// cumulative Σ(typical × vol) / Σ(vol).  Same shape as AVP but
// included for parity with TradingView's nomenclature.
import { VWAP } from 'technicalindicators';
import type { IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

const def: IndicatorDef<object> = {
  name: 'VWAP',
  kind: 'overlay',
  defaults: {},
  compute(candles) {
    const values = VWAP.calculate({
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      close: candles.map((c) => c.close),
      volume: candles.map((c) => c.volume),
    });
    const offset = candles.length - values.length;
    return {
      series: {
        VWAP: values.map((v, i) => ({
          time: candles[i + offset].time as UTCTimestamp,
          value: v,
        })),
      },
    };
  },
  render(api, result) {
    const line = api.addLine({ color: '#F59E0B', lineWidth: 2, title: 'VWAP' });
    line.setData(result.series.VWAP);
    return { seriesHandles: [line], paneIndex: null };
  },
};
export default def;
