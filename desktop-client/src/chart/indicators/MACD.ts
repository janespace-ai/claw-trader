// MACD(12, 26, 9) — DIF, DEA lines + histogram bars (subchart).

import { MACD as TIMACD } from 'technicalindicators';
import type { Candle, IndicatorDef, IndicatorResult } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface MACDOpts {
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
}

const def: IndicatorDef<MACDOpts> = {
  name: 'MACD',
  kind: 'subchart',
  defaults: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },

  compute(candles, opts) {
    const closes = candles.map((c) => c.close);
    const out = TIMACD.calculate({
      values: closes,
      fastPeriod: opts.fastPeriod,
      slowPeriod: opts.slowPeriod,
      signalPeriod: opts.signalPeriod,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const offset = closes.length - out.length;
    const dif: IndicatorResult['series'][string] = [];
    const dea: IndicatorResult['series'][string] = [];
    const hist: Array<{ time: UTCTimestamp; value: number; color: string }> = [];
    for (let i = 0; i < out.length; i++) {
      const t = candles[i + offset].time as UTCTimestamp;
      if (out[i].MACD != null) dif.push({ time: t, value: out[i].MACD! });
      if (out[i].signal != null) dea.push({ time: t, value: out[i].signal! });
      if (out[i].histogram != null) {
        const v = out[i].histogram!;
        hist.push({
          time: t,
          value: v,
          color: v >= 0 ? '#22C55E' : '#EF4444',
        });
      }
    }
    return {
      series: {
        DIF: dif,
        DEA: dea,
        HIST: hist as never,
      },
    };
  },

  render(api, result) {
    const dif = api.addLine({ color: '#3B82F6', lineWidth: 1, title: 'DIF' });
    const dea = api.addLine({ color: '#F59E0B', lineWidth: 1, title: 'DEA' });
    const hist = api.addHistogram({ color: '#22C55E', base: 0, title: 'MACD' });
    dif.setData(result.series.DIF);
    dea.setData(result.series.DEA);
    hist.setData(
      result.series.HIST as unknown as Array<{
        time: UTCTimestamp;
        value: number;
        color: string;
      }>,
    );
    return { seriesHandles: [dif, dea, hist], paneIndex: 0 };
  },
};

export default def;
