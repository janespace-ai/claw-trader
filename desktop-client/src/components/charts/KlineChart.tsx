import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Trade } from '@/types/domain';

export interface KlineCandle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Props {
  candles: KlineCandle[];
  trades?: Trade[];
  indicators?: Array<{ name: string; color: string; data: Array<{ time: number; value: number }> }>;
  height?: number;
}

/** Reads CSS custom properties off :root so we match the active theme. */
function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}

export function KlineChart({ candles, trades = [], indicators = [], height = 420 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const indRefs = useRef<ISeriesApi<'Line'>[]>([]);
  const candleUp = useSettingsStore((s) => s.candleConvention);

  // Create chart once per mount — do NOT destroy on theme/candle change;
  // instead update via applyOptions() in a separate effect.
  useEffect(() => {
    if (!ref.current) return;

    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: readToken('--surface-primary') },
        textColor: readToken('--fg-secondary'),
      },
      grid: {
        vertLines: { color: readToken('--border-subtle') },
        horzLines: { color: readToken('--border-subtle') },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true, secondsVisible: false },
    });

    const series = chart.addCandlestickSeries();

    chartRef.current = chart;
    seriesRef.current = series;

    const resize = () => chart.applyOptions({ width: ref.current!.clientWidth });
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      indRefs.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // Apply candle colors whenever the convention changes — no chart recreate.
  useEffect(() => {
    if (!seriesRef.current) return;
    const up = candleUp === 'red-up' ? readToken('--accent-red') : readToken('--accent-green');
    const down = candleUp === 'red-up' ? readToken('--accent-green') : readToken('--accent-red');
    seriesRef.current.applyOptions({
      upColor: up,
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
    });
  }, [candleUp]);

  // Push candle data.
  useEffect(() => {
    if (!seriesRef.current) return;
    const data: CandlestickData[] = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    seriesRef.current.setData(data);
  }, [candles]);

  // Push trade markers.
  useEffect(() => {
    if (!seriesRef.current) return;
    const up = candleUp === 'red-up' ? readToken('--accent-red') : readToken('--accent-green');
    const down = candleUp === 'red-up' ? readToken('--accent-green') : readToken('--accent-red');

    const markers = trades.flatMap((t) => {
      const entry: Time = (Date.parse(t.entry_time) / 1000) as UTCTimestamp;
      const exit: Time = (Date.parse(t.exit_time) / 1000) as UTCTimestamp;
      return [
        {
          time: entry,
          position: t.side === 'long' ? 'belowBar' : 'aboveBar',
          shape: t.side === 'long' ? 'arrowUp' : 'arrowDown',
          color: t.side === 'long' ? up : down,
          // No text label — the arrow shape + position already conveys side.
        },
        {
          time: exit,
          position: 'inBar',
          shape: 'circle',
          color: t.pnl >= 0 ? up : down,
        },
      ] as any[];
    });
    seriesRef.current.setMarkers(markers);
  }, [trades, candleUp]);

  // Push indicator overlays.
  useEffect(() => {
    if (!chartRef.current) return;
    for (const s of indRefs.current) chartRef.current.removeSeries(s);
    indRefs.current = [];
    for (const ind of indicators) {
      const s = chartRef.current.addLineSeries({
        color: ind.color,
        lineWidth: 2,
        title: ind.name,
      });
      s.setData(ind.data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      indRefs.current.push(s);
    }
  }, [indicators]);

  return <div ref={ref} style={{ width: '100%', height }} />;
}
