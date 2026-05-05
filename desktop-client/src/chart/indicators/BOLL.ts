// BOLL — Bollinger Bands (period=20, stdDev=2).

import { BollingerBands } from 'technicalindicators';
import type { Candle, IndicatorDef, IndicatorResult } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface BOLLOpts {
  period: number;
  stdDev: number;
}

const def: IndicatorDef<BOLLOpts> = {
  name: 'BOLL',
  kind: 'overlay',
  defaults: { period: 20, stdDev: 2 },

  compute(candles, opts) {
    const closes = candles.map((c) => c.close);
    const out = BollingerBands.calculate({
      period: opts.period,
      stdDev: opts.stdDev,
      values: closes,
    });
    const offset = closes.length - out.length;
    const up: IndicatorResult['series'][string] = [];
    const mid: IndicatorResult['series'][string] = [];
    const dn: IndicatorResult['series'][string] = [];
    for (let i = 0; i < out.length; i++) {
      const t = candles[i + offset].time as UTCTimestamp;
      up.push({ time: t, value: out[i].upper });
      mid.push({ time: t, value: out[i].middle });
      dn.push({ time: t, value: out[i].lower });
    }
    return { series: { UP: up, MID: mid, DN: dn } };
  },

  render(api, result) {
    const up = api.addLine({ color: '#A855F7', lineWidth: 1, title: 'UP' });
    const mid = api.addLine({ color: '#A1A1AA', lineWidth: 1, title: 'MID' });
    const dn = api.addLine({ color: '#A855F7', lineWidth: 1, title: 'DN' });
    up.setData(result.series.UP);
    mid.setData(result.series.MID);
    dn.setData(result.series.DN);
    return { seriesHandles: [up, mid, dn], paneIndex: null };
  },
};

export default def;
