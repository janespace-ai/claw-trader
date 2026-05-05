// AO — Awesome Oscillator (subchart): SMA(median, 5) - SMA(median, 34).
import { AwesomeOscillator } from 'technicalindicators';
import type { IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

const def: IndicatorDef<object> = {
  name: 'AO',
  kind: 'subchart',
  defaults: {},
  compute(candles) {
    const values = AwesomeOscillator.calculate({
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      fastPeriod: 5,
      slowPeriod: 34,
      format: (n: number) => n,
    });
    const offset = candles.length - values.length;
    const data = values.map((v, i) => ({
      time: candles[i + offset].time as UTCTimestamp,
      value: v,
      color: i > 0 && v >= values[i - 1] ? '#22C55E' : '#EF4444',
    }));
    return { series: { AO: data as never } };
  },
  render(api, result) {
    const hist = api.addHistogram({ color: '#22C55E', base: 0, title: 'AO' });
    hist.setData(
      result.series.AO as unknown as Array<{ time: UTCTimestamp; value: number; color: string }>,
    );
    return { seriesHandles: [hist], paneIndex: 0 };
  },
};
export default def;
