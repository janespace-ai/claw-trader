import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  type UTCTimestamp,
} from 'lightweight-charts';

interface Props {
  points: Array<{ time: number; value: number }>;
  height?: number;
  overbought?: number; // e.g. 70
  oversold?: number;   // e.g. 30
}

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}

/** Separate panel for RSI or similar bounded oscillator. Includes 30/70 guides. */
export function RsiSubchart({ points, height = 90, overbought = 70, oversold = 30 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const purple = readToken('--accent-primary');
    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: readToken('--surface-primary') },
        textColor: readToken('--fg-muted'),
      },
      grid: {
        vertLines: { color: readToken('--border-subtle') },
        horzLines: { color: readToken('--border-subtle') },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: { visible: false, borderVisible: false },
    });

    // Guide lines at overbought + oversold thresholds.
    const ob = chart.addLineSeries({ color: readToken('--accent-red'), lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const os = chart.addLineSeries({ color: readToken('--accent-green'), lineWidth: 1, priceLineVisible: false, lastValueVisible: false });

    const rsi = chart.addLineSeries({ color: purple, lineWidth: 2, priceLineVisible: false, lastValueVisible: true });

    rsi.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    if (points.length > 0) {
      ob.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: overbought })));
      os.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: oversold })));
    }

    const resize = () => chart.applyOptions({ width: ref.current!.clientWidth });
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.remove();
    };
  }, [points, height, overbought, oversold]);

  return (
    <div className="relative">
      <div className="absolute top-1 left-2 z-10 text-[10px] text-fg-muted font-mono pointer-events-none">RSI(14)</div>
      <div ref={ref} style={{ width: '100%', height }} />
    </div>
  );
}

/** Simple pandas-style RSI computation in pure TS. */
export function computeRSI(
  candles: Array<{ time: number; close: number }>,
  period = 14,
): Array<{ time: number; value: number }> {
  if (candles.length < period + 1) return [];
  const out: Array<{ time: number; value: number }> = [];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = candles[i].close - candles[i - 1].close;
    if (d >= 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close;
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    out.push({ time: candles[i].time, value: rsi });
  }
  return out;
}
