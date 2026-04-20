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
import { chartOptionsFromTheme, observeThemeChanges, readThemeVars, resolveCssColor } from './theme';

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

/** Time range the user is currently looking at, emitted as a pair of
 *  unix-second timestamps. Subscribers (e.g. indicator panes rendered
 *  below the chart) use this to clip their own data so zoom/pan stays
 *  in sync. `null` means "no visible range yet" (pre-data mount). */
export interface VisibleTimeRange {
  from: number;
  to: number;
}

/** Measurements of the chart's drawable area so panes rendered below
 *  can inset their SVG to the same plot region (exclude the right
 *  price-axis gutter). All values in CSS pixels. */
export interface PlotLayout {
  /** Total container width. */
  totalWidthPx: number;
  /** Width of the time-scale / plot area — excludes the right axis. */
  plotWidthPx: number;
  /** Width of the right price axis gutter (`totalWidthPx - plotWidthPx`). */
  rightGutterPx: number;
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
  /** Fired whenever the user zooms / pans the chart so pane-indicators
   *  rendered below can clip their data to the visible range. */
  onVisibleTimeRangeChange?: (range: VisibleTimeRange | null) => void;
  /** Fired after mount and whenever the chart resizes or its right
   *  price-axis gutter changes (e.g. when a wider number moves into
   *  view). Panes use this to match horizontal alignment. */
  onPlotLayoutChange?: (layout: PlotLayout) => void;
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
  onVisibleTimeRangeChange,
  onPlotLayoutChange,
}: Props) {
  // Latest callbacks in refs so the subscribe effect below doesn't
  // have to re-subscribe every time the parent rebinds them.
  const onVisibleRef = useRef(onVisibleTimeRangeChange);
  onVisibleRef.current = onVisibleTimeRangeChange;
  const onLayoutRef = useRef(onPlotLayoutChange);
  onLayoutRef.current = onPlotLayoutChange;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  /** Imperative hook exposed by the mount effect so downstream data /
   *  overlay / marker effects can request a layout re-measure on the
   *  next animation frame (lightweight-charts updates its price-axis
   *  width asynchronously after `setData`). */
  const emitLayoutSoonRef = useRef<() => void>(() => {});

  // -- Create on mount --------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(
      containerRef.current,
      // `autoSize: true` (lightweight-charts ≥ 4.0) lets the library
      // track container size via its own ResizeObserver. Our manual
      // observer below stays as a belt-and-suspenders guard for older
      // browser quirks; the library owning the primary path avoids the
      // "mount at small width, never catches up" failure mode.
      { ...chartOptionsFromTheme(containerRef.current.clientWidth, height), autoSize: true },
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

    // Layout measurement — emit plot width + right-axis gutter so pane
    // indicators below can inset their SVG to the same plot area.
    // Guarded against duplicate emits with a small "last" cache so
    // the callback fires only when measurements actually change.
    let lastLayoutJson = '';
    const emitLayout = () => {
      if (!chartRef.current || !containerRef.current) return;
      const totalWidthPx = containerRef.current.clientWidth;
      // Prefer the price scale's own width() over
      // `total − timeScale().width()` because the latter under-reports
      // before `setData` has populated the scale with labels — we'd
      // emit a near-zero gutter, panes would render too wide, then
      // never re-measure. `priceScale('right').width()` tracks label
      // width dynamically via lightweight-charts' internal layout.
      let rightGutterPx = 0;
      try {
        rightGutterPx = chartRef.current.priceScale('right').width();
      } catch {
        const plotW = chartRef.current.timeScale().width();
        rightGutterPx = Math.max(0, totalWidthPx - plotW);
      }
      const plotWidthPx = Math.max(0, totalWidthPx - rightGutterPx);
      const next = { totalWidthPx, plotWidthPx, rightGutterPx };
      const json = `${next.totalWidthPx}|${next.plotWidthPx}`;
      if (json === lastLayoutJson) return;
      lastLayoutJson = json;
      onLayoutRef.current?.(next);
    };
    // Some measurements only stabilise after one paint (e.g. the
    // right-axis gutter depends on label widths which depend on the
    // last `setData`). `emitLayoutSoon` schedules the measure via rAF
    // so it runs after the browser has laid out the new frame.
    let rafId = 0;
    const emitLayoutSoon = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        emitLayout();
      });
    };
    emitLayoutSoonRef.current = emitLayoutSoon;
    // Resize observer — also re-measures plot layout whenever the
    // container changes size.
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        chart.resize(e.contentRect.width, height);
      }
      emitLayout();
    });
    ro.observe(containerRef.current);

    // Visible-range sync. We read the `Time` union as unix seconds —
    // our chart always uses `UTCTimestamp` (number) times, so the
    // `typeof === 'number'` branch always hits in practice. A defensive
    // fallback handles the rare edge case. Also re-measures layout
    // because the right-axis gutter can widen/narrow when different
    // numbers come into view (e.g. zooming into 80000s vs 1M).
    const rangeHandler = (
      range: { from: Time; to: Time } | null,
    ) => {
      if (!range) {
        onVisibleRef.current?.(null);
        return;
      }
      const from = typeof range.from === 'number' ? range.from : 0;
      const to = typeof range.to === 'number' ? range.to : 0;
      onVisibleRef.current?.({ from, to });
      emitLayout();
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(rangeHandler);

    // Initial layout emit (next microtask so the chart has laid out).
    const initialLayoutT = setTimeout(emitLayoutSoon, 0);

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
      clearTimeout(initialLayoutT);
      if (rafId) cancelAnimationFrame(rafId);
      emitLayoutSoonRef.current = () => {};
      ro.disconnect();
      chart.timeScale().unsubscribeVisibleTimeRangeChange(rangeHandler);
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
    // New data → new price labels → potentially different right-axis
    // gutter width. Schedule a re-measure for the next animation frame
    // so panes re-align.
    emitLayoutSoonRef.current();
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
    const themeVars = readThemeVars();
    for (const ov of overlays) {
      let ser = existing.get(ov.id);
      // lightweight-charts doesn't understand CSS variables (the `color`
      // option goes straight into canvas stroke style). Resolve `var(...)`
      // via getComputedStyle so callers can pass token names for free.
      const resolvedColor = resolveCssColor(ov.color) ?? themeVars.accentPrimary;
      if (!ser) {
        ser = chart.addLineSeries({
          color: resolvedColor,
          lineWidth: ov.lineWidth ?? 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        existing.set(ov.id, ser);
      } else {
        ser.applyOptions({ color: resolvedColor, lineWidth: ov.lineWidth ?? 2 });
      }
      ser.setData(
        ov.data.map((p) => ({
          time: p.ts as UTCTimestamp,
          value: p.value,
        })),
      );
    }
    // Overlays can pull the visible y-range into larger-number territory
    // (e.g. BB upper bands in a price peak), widening the right-axis
    // gutter; re-measure after paint.
    emitLayoutSoonRef.current();
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
