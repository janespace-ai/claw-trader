// DMI — Directional Movement Index: +DI / -DI / ADX (subchart).
import { ADX } from 'technicalindicators';
import type { IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface Opts { period: number }
const def: IndicatorDef<Opts> = {
  name: 'DMI',
  kind: 'subchart',
  defaults: { period: 14 },
  compute(candles, opts) {
    const out = ADX.calculate({
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      close: candles.map((c) => c.close),
      period: opts.period,
    });
    const offset = candles.length - out.length;
    const time = (i: number) => candles[i + offset].time as UTCTimestamp;
    return {
      series: {
        '+DI': out.map((p, i) => ({ time: time(i), value: p.pdi })),
        '-DI': out.map((p, i) => ({ time: time(i), value: p.mdi })),
        ADX: out.map((p, i) => ({ time: time(i), value: p.adx })),
      },
    };
  },
  render(api, result) {
    const pdi = api.addLine({ color: '#10B981', lineWidth: 1, title: '+DI' });
    const mdi = api.addLine({ color: '#EF4444', lineWidth: 1, title: '-DI' });
    const adx = api.addLine({ color: '#A855F7', lineWidth: 1, title: 'ADX' });
    pdi.setData(result.series['+DI']);
    mdi.setData(result.series['-DI']);
    adx.setData(result.series.ADX);
    return { seriesHandles: [pdi, mdi, adx], paneIndex: 0 };
  },
};
export default def;
