// DMA — Difference of Moving Averages (subchart). Hand-rolled.
//   DIF = MA(short) - MA(long); AMA = MA(DIF, M)
import { SMA } from 'technicalindicators';
import type { IndicatorDef } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface Opts { short: number; long: number; m: number }
const def: IndicatorDef<Opts> = {
  name: 'DMA',
  kind: 'subchart',
  defaults: { short: 10, long: 50, m: 10 },
  compute(candles, opts) {
    const closes = candles.map((c) => c.close);
    const sShort = SMA.calculate({ period: opts.short, values: closes });
    const sLong = SMA.calculate({ period: opts.long, values: closes });
    // Align both starting from the longer one.
    const start = closes.length - sLong.length;
    const dif: number[] = sLong.map(
      (lv, i) => sShort[i + (sShort.length - sLong.length)] - lv,
    );
    const ama = SMA.calculate({ period: opts.m, values: dif });
    const difTime = (i: number) => candles[i + start].time as UTCTimestamp;
    const amaOff = dif.length - ama.length;
    const amaTime = (i: number) => candles[i + start + amaOff].time as UTCTimestamp;
    return {
      series: {
        DIF: dif.map((v, i) => ({ time: difTime(i), value: v })),
        AMA: ama.map((v, i) => ({ time: amaTime(i), value: v })),
      },
    };
  },
  render(api, result) {
    const dif = api.addLine({ color: '#3B82F6', lineWidth: 1, title: 'DIF' });
    const ama = api.addLine({ color: '#F59E0B', lineWidth: 1, title: 'AMA' });
    dif.setData(result.series.DIF);
    ama.setData(result.series.AMA);
    return { seriesHandles: [dif, ama], paneIndex: 0 };
  },
};
export default def;
