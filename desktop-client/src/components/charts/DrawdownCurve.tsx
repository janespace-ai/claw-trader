import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  AreaSeries,
  type UTCTimestamp,
} from 'lightweight-charts';

interface Props {
  points: Array<{ ts: string; drawdown: number }>;
  height?: number;
}

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}

/** Area chart under zero showing drawdown %. Red-tinted regardless of theme. */
export function DrawdownCurve({ points, height = 140 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const red = readToken('--accent-red');
    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: readToken('--surface-secondary') },
        textColor: readToken('--fg-muted'),
      },
      grid: {
        vertLines: { color: readToken('--border-subtle') },
        horzLines: { color: readToken('--border-subtle') },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: red,
      topColor: red + '00',
      bottomColor: red + '88',
      lineWidth: 2,
    });
    series.setData(
      points.map((p) => ({
        time: (Date.parse(p.ts) / 1000) as UTCTimestamp,
        value: p.drawdown,
      })),
    );
    const resize = () => chart.applyOptions({ width: ref.current!.clientWidth });
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.remove();
    };
  }, [points, height]);

  return <div ref={ref} style={{ width: '100%', height }} />;
}

/** Derive a drawdown series from an equity curve. */
export function computeDrawdown(equity: Array<{ ts: string; equity: number }>) {
  let peak = -Infinity;
  return equity.map((p) => {
    peak = Math.max(peak, p.equity);
    const dd = peak > 0 ? ((p.equity - peak) / peak) * 100 : 0;
    return { ts: p.ts, drawdown: dd };
  });
}
