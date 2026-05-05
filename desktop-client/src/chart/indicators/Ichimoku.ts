// Ichimoku Cloud (overlay).  NEW vs klinecharts.
// 5 lines: tenkan, kijun, senkou A/B, chikou.
import { IchimokuCloud } from 'technicalindicators';
import type { IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface Opts {
  conversionPeriod: number;
  basePeriod: number;
  spanPeriod: number;
  displacement: number;
}

const def: IndicatorDef<Opts> = {
  name: 'Ichimoku',
  kind: 'overlay',
  defaults: {
    conversionPeriod: 9,
    basePeriod: 26,
    spanPeriod: 52,
    displacement: 26,
  },
  compute(candles, opts) {
    const out = IchimokuCloud.calculate({
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      conversionPeriod: opts.conversionPeriod,
      basePeriod: opts.basePeriod,
      spanPeriod: opts.spanPeriod,
      displacement: opts.displacement,
    });
    const offset = candles.length - out.length;
    const time = (i: number) => candles[i + offset].time as UTCTimestamp;
    return {
      series: {
        Tenkan: out.map((p, i) => ({ time: time(i), value: p.conversion })),
        Kijun: out.map((p, i) => ({ time: time(i), value: p.base })),
        SenkouA: out.map((p, i) => ({ time: time(i), value: p.spanA })),
        SenkouB: out.map((p, i) => ({ time: time(i), value: p.spanB })),
      },
    };
  },
  render(api, result) {
    const tenkan = api.addLine({ color: '#3B82F6', lineWidth: 1, title: 'Tenkan' });
    const kijun = api.addLine({ color: '#EF4444', lineWidth: 1, title: 'Kijun' });
    const spanA = api.addLine({ color: '#22C55E', lineWidth: 1, title: 'SenkouA' });
    const spanB = api.addLine({ color: '#A855F7', lineWidth: 1, title: 'SenkouB' });
    tenkan.setData(result.series.Tenkan);
    kijun.setData(result.series.Kijun);
    spanA.setData(result.series.SenkouA);
    spanB.setData(result.series.SenkouB);
    return { seriesHandles: [tenkan, kijun, spanA, spanB], paneIndex: null };
  },
};
export default def;
