import { useEffect, useRef } from 'react';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import { chartOptionsFromTheme, observeThemeChanges, readThemeVars } from './theme';

export interface CandlePoint {
  ts: number; // unix seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface OverlayLine {
  /** Unique id; used for React key + updates. */
  id: string;
  data: { ts: number; value: number }[];
  color?: string;
  lineWidth?: 1 | 2 | 3 | 4;
}

export interface ChartMarker {
  ts: number;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  color?: string;
  text?: string;
}

interface Props {
  data: CandlePoint[];
  overlays?: OverlayLine[];
  markers?: ChartMarker[];
  showVolume?: boolean;
  height?: number;
  className?: string;
  /** Candle color convention. Defaults to "green-up" (crypto). */
  convention?: 'green-up' | 'red-up';
}

/**
 * Candlestick chart primitive. Imperative-inside, declarative-outside.
 * Props drive `series.setData` / `setMarkers` on the underlying
 * `lightweight-charts` instance. Theme switches redraw via applyOptions.
 */
export function Candles({
  data,
  overlays = [],
  markers = [],
  showVolume = false,
  height = 360,
  className,
  convention = 'green-up',
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());

  // -- Create on mount --------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(
      containerRef.current,
      chartOptionsFromTheme(containerRef.current.clientWidth, height),
    );
    chartRef.current = chart;

    const t = readThemeVars();
    const up = convention === 'green-up' ? t.accentGreen : t.accentRed;
    const down = convention === 'green-up' ? t.accentRed : t.accentGreen;

    const candles = chart.addCandlestickSeries({
      upColor: up,
      downColor: down,
      wickUpColor: up,
      wickDownColor: down,
      borderVisible: false,
    });
    candleSeriesRef.current = candles;

    if (showVolume) {
      const vol = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.75, bottom: 0 },
      });
      volumeSeriesRef.current = vol;
    }

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        chart.resize(e.contentRect.width, height);
      }
    });
    ro.observe(containerRef.current);

    // Theme redraw
    const stopTheme = observeThemeChanges(() => {
      const tt = readThemeVars();
      chart.applyOptions(chartOptionsFromTheme());
      const up2 = convention === 'green-up' ? tt.accentGreen : tt.accentRed;
      const down2 = convention === 'green-up' ? tt.accentRed : tt.accentGreen;
      candles.applyOptions({
        upColor: up2,
        downColor: down2,
        wickUpColor: up2,
        wickDownColor: down2,
      });
    });

    return () => {
      ro.disconnect();
      stopTheme();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      overlaySeriesRef.current.clear();
    };
    // Intentionally not including every dep — primitive owns instance.
    // Changes via props land in the downstream effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- Data updates -----------------------------------------------------------
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const ohlc: CandlestickData[] = data.map((p) => ({
      time: p.ts as UTCTimestamp,
      open: p.o,
      high: p.h,
      low: p.l,
      close: p.c,
    }));
    series.setData(ohlc);

    if (volumeSeriesRef.current) {
      const t = readThemeVars();
      const upDim = `${t.accentGreen}55`;
      const downDim = `${t.accentRed}55`;
      volumeSeriesRef.current.setData(
        data.map((p) => ({
          time: p.ts as UTCTimestamp,
          value: p.v ?? 0,
          color: p.c >= p.o ? upDim : downDim,
        })),
      );
    }
  }, [data]);

  // -- Overlay lines ----------------------------------------------------------
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const existing = overlaySeriesRef.current;
    const incoming = new Map(overlays.map((o) => [o.id, o]));

    // Remove series not in incoming.
    for (const [id, ser] of existing.entries()) {
      if (!incoming.has(id)) {
        chart.removeSeries(ser);
        existing.delete(id);
      }
    }
    // Add/update series in incoming.
    for (const ov of overlays) {
      let ser = existing.get(ov.id);
      if (!ser) {
        ser = chart.addLineSeries({
          color: ov.color ?? readThemeVars().accentPrimary,
          lineWidth: ov.lineWidth ?? 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        existing.set(ov.id, ser);
      }
      ser.setData(
        ov.data.map((p) => ({
          time: p.ts as UTCTimestamp,
          value: p.value,
        })),
      );
    }
  }, [overlays]);

  // -- Markers ----------------------------------------------------------------
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const t = readThemeVars();
    const mapped: SeriesMarker<Time>[] = markers.map((m) => ({
      time: m.ts as UTCTimestamp,
      position: m.position,
      shape: m.shape,
      color: m.color ?? t.accentPrimary,
      text: m.text,
    }));
    series.setMarkers(mapped);
  }, [markers]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: `${height}px` }}
    />
  );
}
