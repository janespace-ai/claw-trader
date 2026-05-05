// Keltner Channels (overlay). NEW vs klinecharts.
//   middle = EMA(close, N)
//   upper  = middle + multiplier × ATR(N)
//   lower  = middle - multiplier × ATR(N)
// Hand-rolled — technicalindicators ships EMA + ATR but not the
// composite KC.

import { ATR, EMA } from 'technicalindicators';
import type { IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface Opts { period: number; multiplier: number }

const def: IndicatorDef<Opts> = {
  name: 'Keltner',
  kind: 'overlay',
  defaults: { period: 20, multiplier: 2 },
  compute(candles, opts) {
    const closes = candles.map((c) => c.close);
    const ema = EMA.calculate({ period: opts.period, values: closes });
    const atr = ATR.calculate({
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      close: closes,
      period: opts.period,
    });
    // Align both to the shorter array.
    const minLen = Math.min(ema.length, atr.length);
    const emaAligned = ema.slice(ema.length - minLen);
    const atrAligned = atr.slice(atr.length - minLen);
    const offset = candles.length - minLen;
    const time = (i: number) => candles[i + offset].time as UTCTimestamp;
    const mid: { time: UTCTimestamp; value: number }[] = [];
    const up: { time: UTCTimestamp; value: number }[] = [];
    const dn: { time: UTCTimestamp; value: number }[] = [];
    for (let i = 0; i < minLen; i++) {
      mid.push({ time: time(i), value: emaAligned[i] });
      up.push({ time: time(i), value: emaAligned[i] + opts.multiplier * atrAligned[i] });
      dn.push({ time: time(i), value: emaAligned[i] - opts.multiplier * atrAligned[i] });
    }
    return { series: { UP: up, MID: mid, DN: dn } };
  },
  render(api, result) {
    const up = api.addLine({ color: '#F59E0B', lineWidth: 1, title: 'KC UP' });
    const mid = api.addLine({ color: '#A1A1AA', lineWidth: 1, title: 'KC MID' });
    const dn = api.addLine({ color: '#F59E0B', lineWidth: 1, title: 'KC DN' });
    up.setData(result.series.UP);
    mid.setData(result.series.MID);
    dn.setData(result.series.DN);
    return { seriesHandles: [up, mid, dn], paneIndex: null };
  },
};
export default def;
