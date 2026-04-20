import { useEffect, useRef } from 'react';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type Time,
} from 'lightweight-charts';
import {
  chartOptionsFromTheme,
  observeThemeChanges,
  resolveCssColor,
} from '@/components/primitives/ClawChart/theme';
import type { IndicatorPoint, IndicatorSeriesPoint } from '@/services/indicators';

export interface LineSpec {
  /** Accepts either a dense `IndicatorPoint[]` (from raw math) or a
   *  `IndicatorSeriesPoint[]` padded to the parent candles grid with
   *  `value: null` at warmup bars. The pane emits whitespace points
   *  for null values so logical indices stay aligned with sibling
   *  charts. */
  data: IndicatorPoint[] | IndicatorSeriesPoint[];
  color: string;
  lineWidth?: 1 | 2 | 3 | 4;
}

export interface GuideSpec {
  value: number;
  color: string;
  dashed?: boolean;
}

/** One inline value badge rendered in the pane header. When multiple
 *  lines are plotted (e.g. MACD has macd + signal + histogram), each
 *  value is shown in its corresponding line color so the user can
 *  read them at a glance — matching Gate's "RSI 14 43.12" /
 *  "MACD 12 26 close 9 EMA EMA -3.7 -68.8 -65.2" headers. */
export interface HeaderValue {
  text: string;
  color?: string;
}

interface Props {
  title: string;
  /** Parameter string shown after the title (e.g. "(14)", "(12, 26, 9)"). */
  params?: string;
  /** @deprecated — use `values` instead. Kept for backward-compat. */
  latestLabel?: string;
  /** Per-line latest values, rendered after `title (params)` in the
   *  pane header row. Colors match the corresponding chart line so
   *  users can visually associate each number with its series. */
  values?: HeaderValue[];
  lines: LineSpec[];
  histogram?: IndicatorPoint[] | IndicatorSeriesPoint[];
  guides?: GuideSpec[];
  height?: number;
  /** Only the bottom-most active pane should show the time axis. */
  showTimeAxis?: boolean;
  /** Minimum width of the right price scale (in pixels). Used by the
   *  parent to force every pane — plus the main chart — to the same
   *  gutter width, so they line up horizontally in spite of differing
   *  label widths (RSI reads 0-100, MACD reads ±200, OBV reads 1e8…). */
  priceScaleMinWidth?: number;
  /** Fired once the chart is created. Parent uses this to register
   *  the instance for bidirectional time-scale sync with sibling panes
   *  and the main candle chart. */
  onChartReady?: (chart: IChartApi) => void;
}

/**
 * Pane indicator rendered as a real lightweight-charts instance, so
 * its time scale can be synced with the main chart's time scale for
 * pixel-accurate zoom / pan alignment (the SVG-based approach only
 * matched time range, not pixel positions).
 *
 * The chart is created once on mount; subsequent prop updates flow
 * into the existing series via `setData` / `applyOptions` so the
 * instance (and its registered sync subscriptions) stay stable across
 * re-renders.
 */
export function IndicatorChartPane({
  title,
  params,
  latestLabel,
  values,
  lines,
  histogram,
  guides = [],
  height = 100,
  showTimeAxis = false,
  priceScaleMinWidth,
  onChartReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  const histogramSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // Latest callback held in a ref so the mount effect doesn't re-run.
  const onReadyRef = useRef(onChartReady);
  onReadyRef.current = onChartReady;

  // -- Create on mount --------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      ...chartOptionsFromTheme(containerRef.current.clientWidth, height),
      height,
      autoSize: true,
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      timeScale: {
        visible: showTimeAxis,
        borderVisible: showTimeAxis,
        timeVisible: true,
        secondsVisible: false,
      },
    });
    chartRef.current = chart;

    onReadyRef.current?.(chart);

    const stopTheme = observeThemeChanges(() => {
      chart.applyOptions(chartOptionsFromTheme());
    });

    return () => {
      stopTheme();
      chart.remove();
      chartRef.current = null;
      lineSeriesRef.current = [];
      histogramSeriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- Show / hide time axis when flag toggles --------------------------------
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({
      timeScale: {
        visible: showTimeAxis,
        borderVisible: showTimeAxis,
        timeVisible: true,
        secondsVisible: false,
      },
    });
  }, [showTimeAxis]);

  // -- Apply price-scale minimum width ---------------------------------------
  useEffect(() => {
    if (!chartRef.current || priceScaleMinWidth == null) return;
    chartRef.current.priceScale('right').applyOptions({
      minimumWidth: priceScaleMinWidth,
    });
  }, [priceScaleMinWidth]);

  // -- Reconcile line series with `lines` prop -------------------------------
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const existing = lineSeriesRef.current;
    // Grow / shrink the series count to match.
    while (existing.length < lines.length) {
      const s = chart.addLineSeries({
        priceLineVisible: false,
        lastValueVisible: true,
      });
      existing.push(s);
    }
    while (existing.length > lines.length) {
      const s = existing.pop();
      if (s) chart.removeSeries(s);
    }
    // Update each series' data + color. Null / non-finite values are
    // emitted as lightweight-charts whitespace points (`{ time }` only)
    // so every series keeps a logical index for every candle timestamp,
    // even for warmup bars before the indicator stabilises. That
    // alignment is what lets the cross-chart logical-range sync stay
    // in register when the user pans past the last bar.
    lines.forEach((spec, i) => {
      const s = existing[i];
      const color = resolveCssColor(spec.color) ?? '#888';
      s.applyOptions({ color, lineWidth: spec.lineWidth ?? 2 });
      s.setData(
        spec.data.map((p) =>
          p.value == null || !Number.isFinite(p.value)
            ? { time: p.ts as UTCTimestamp }
            : { time: p.ts as UTCTimestamp, value: p.value },
        ),
      );
    });
  }, [lines]);

  // -- Reconcile optional histogram series (MACD) ----------------------------
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (!histogram || histogram.length === 0) {
      if (histogramSeriesRef.current) {
        chart.removeSeries(histogramSeriesRef.current);
        histogramSeriesRef.current = null;
      }
      return;
    }
    const green = resolveCssColor('var(--accent-green)') ?? '#22C55E';
    const red = resolveCssColor('var(--accent-red)') ?? '#EF4444';
    if (!histogramSeriesRef.current) {
      histogramSeriesRef.current = chart.addHistogramSeries({
        priceLineVisible: false,
        lastValueVisible: false,
        base: 0,
      });
    }
    histogramSeriesRef.current.setData(
      histogram.map((p) =>
        p.value == null || !Number.isFinite(p.value)
          ? { time: p.ts as Time }
          : {
              time: p.ts as Time,
              value: p.value,
              color: (p.value >= 0 ? green : red) + '80',
            },
      ),
    );
  }, [histogram]);

  // -- Reconcile horizontal guides via priceLines on the first series -------
  useEffect(() => {
    const series = lineSeriesRef.current[0];
    if (!series) return;
    // lightweight-charts doesn't expose a "clear all price lines" API,
    // so we track the lines we've created and remove before re-adding.
    const created: ReturnType<typeof series.createPriceLine>[] = [];
    for (const g of guides) {
      const color = resolveCssColor(g.color) ?? '#888';
      created.push(
        series.createPriceLine({
          price: g.value,
          color,
          lineWidth: 1,
          // 2 = Dashed, 0 = Solid.
          lineStyle: g.dashed === false ? 0 : 2,
          axisLabelVisible: false,
          title: '',
        }),
      );
    }
    return () => {
      for (const pl of created) {
        try {
          series.removePriceLine(pl);
        } catch {
          // series may be disposed during fast re-renders; ignore.
        }
      }
    };
  }, [guides, lines.length]);

  return (
    <div className="bg-surface-secondary rounded-md pt-1" aria-label={title}>
      <div className="flex items-center gap-2 text-[10px] px-2 pb-1 whitespace-nowrap overflow-hidden">
        <span className="font-semibold text-fg-primary">{title}</span>
        {params && <span className="text-fg-muted">{params}</span>}
        {/* Gate-style inline value badges, each colored to match its
            chart line. Falls back to the deprecated single-string
            `latestLabel` prop when `values` isn't supplied. */}
        {values && values.length > 0 ? (
          values.map((v, i) => (
            <span
              key={i}
              className="font-mono"
              style={v.color ? { color: resolveCssColor(v.color) ?? undefined } : undefined}
            >
              {v.text}
            </span>
          ))
        ) : latestLabel != null ? (
          <span className="font-mono text-fg-muted ml-auto">{latestLabel}</span>
        ) : null}
      </div>
      <div ref={containerRef} style={{ width: '100%', height }} />
    </div>
  );
}
