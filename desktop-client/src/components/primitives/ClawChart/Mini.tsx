import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { readThemeVars } from './theme';

interface Props {
  data: { ts: number; value: number }[] | number[];
  height?: number;
  color?: string;
  className?: string;
}

/**
 * Tiny non-interactive sparkline. Used in Watchlist / Strategy cards /
 * Multi-Symbol Grid. No crosshair, no axes, no tooltip.
 *
 * Accepts either `{ts, value}` points or a bare `number[]` (equity
 * snapshots). Bare numbers get assigned synthetic monotonic timestamps.
 */
export function Mini({ data, height = 40, color, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: { background: { color: 'transparent' }, textColor: 'transparent' },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false, borderVisible: false },
      timeScale: { visible: false, borderVisible: false },
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
      handleScale: false,
      handleScroll: false,
    });
    chartRef.current = chart;

    const c = color ?? readThemeVars().accentPrimary;
    const series = chart.addLineSeries({
      color: c,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const points =
      Array.isArray(data) && typeof data[0] === 'number'
        ? (data as number[]).map((v, i) => ({
            time: (i + 1) as UTCTimestamp,
            value: v,
          }))
        : (data as { ts: number; value: number }[]).map((p) => ({
            time: p.ts as UTCTimestamp,
            value: p.value,
          }));
    series.setData(points);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) chart.resize(e.contentRect.width, height);
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, height, color]);

  return (
    <div ref={containerRef} className={className} style={{ width: '100%', height: `${height}px` }} />
  );
}
