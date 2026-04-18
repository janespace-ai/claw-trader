import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts';

interface Props {
  points: Array<{ ts: string; equity: number }>;
  height?: number;
  color?: string;
}

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}

export function EquityCurve({ points, height = 160, color }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current) return;
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
    const series = chart.addAreaSeries({
      lineColor: color ?? readToken('--accent-primary'),
      topColor: (color ?? readToken('--accent-primary')) + '55',
      bottomColor: (color ?? readToken('--accent-primary')) + '00',
      lineWidth: 2,
    });
    series.setData(
      points.map((p) => ({
        time: (Date.parse(p.ts) / 1000) as UTCTimestamp,
        value: p.equity,
      })),
    );
    chartRef.current = chart;
    const resize = () => chart.applyOptions({ width: ref.current!.clientWidth });
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.remove();
    };
  }, [points, height, color]);

  return <div ref={ref} style={{ width: '100%', height }} />;
}
