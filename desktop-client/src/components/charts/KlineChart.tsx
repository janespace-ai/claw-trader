// KlineChart — workspace's main K-line viewer.
//
// Backed by TradingView Lightweight Charts v5 (Apache 2.0) +
// `technicalindicators` calc layer.
//
// API: parent provides `symbol` + `interval` + a `loadBars` async
// callback that returns ordered klines.  We call it once on mount
// (`type='init'`) and again whenever the user pans left enough to
// need older bars (`type='backward'`).
//
// Layout policy (matches gate.com behavior):
//   - Total chart height is FIXED via the `height` prop.
//   - Adding a subchart compresses existing panes via v5's pane
//     redistribution.  Removing one gives the space back.
//   - Per-subchart × overlays are React buttons positioned at each
//     pane's top-right (Y measured via `chart.paneSize(paneIndex)`).
//   - v5 panes are user-draggable natively at the inter-pane
//     separator.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChartIndicatorsStore } from '@/stores/chartIndicatorsStore';
import { getIndicatorDef } from '@/chart/indicators/registry';
import { createPaneRenderApi } from '@/chart/paneRenderer';
import type { Candle, RenderedIndicator } from '@/chart/types';

export interface KlineCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type LoadBarsType = 'init' | 'forward' | 'backward';

export interface LoadBarsRequest {
  symbol: string;
  interval: string;
  type: LoadBarsType;
  /** unix seconds — for backward load, fetch bars older than this. */
  timestamp: number | null;
}

export interface LoadBarsResult {
  bars: KlineCandle[];
  hasMoreBackward: boolean;
}

interface Props {
  symbol: string;
  interval: string;
  loadBars: (req: LoadBarsRequest) => Promise<LoadBarsResult>;
  /** Fixed total height in px (default 560 — matches gate.com proportion). */
  height?: number;
}

const DEFAULT_HEIGHT = 440;
const PAGE_LIMIT_TRIGGER_BARS = 20;
const HISTORY_DEBOUNCE_MS = 250;

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}

function toCandle(c: KlineCandle): Candle {
  return {
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume ?? 0,
  };
}

interface PaneOverlayBtn {
  paneIndex: number;
  name: string;
  /** Pixel top offset from chart container's top edge. */
  top: number;
}

export function KlineChart({ symbol, interval, loadBars, height = DEFAULT_HEIGHT }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  /** All bars currently loaded into the chart, ascending by time. */
  const candlesRef = useRef<Candle[]>([]);
  /** false when backend signals end-of-history. */
  const hasMoreBackwardRef = useRef(true);
  /** Single-flight guard for the backward fetch. */
  const fetchingRef = useRef(false);
  /** Bumps on every (symbol, interval) change to invalidate in-flight fetches. */
  const reqIdRef = useRef(0);
  const debounceTimerRef = useRef<number | null>(null);

  /** Indicator name → handle returned by render() so we can remove it. */
  const indicatorHandlesRef = useRef<Map<string, RenderedIndicator>>(new Map());
  /** Subchart name → its v5 paneIndex (1, 2, 3, ...).  Order matters. */
  const subchartPaneOrderRef = useRef<string[]>([]);

  const candleConvention = useSettingsStore((s) => s.candleConvention);
  const overlays = useChartIndicatorsStore((s) => s.overlays);
  const subcharts = useChartIndicatorsStore((s) => s.subcharts);
  const removeSubchart = useChartIndicatorsStore((s) => s.removeSubchart);

  const [overlayBtns, setOverlayBtns] = useState<PaneOverlayBtn[]>([]);
  /** Earliest loaded bar's unix-second timestamp — used by the
   *  end-of-history badge so users see a date, not just "no more data". */
  const [endOfHistoryTs, setEndOfHistoryTs] = useState<number | null>(null);

  // ---------------------------------------------------------------
  // Mount + create chart once per (symbol, interval) tuple.
  // ---------------------------------------------------------------
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
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderVisible: false,
      },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(
      CandlestickSeries,
      candleColorOpts(candleConvention),
      0, // candle pane = paneIndex 0
    );
    candleSeriesRef.current = candleSeries;

    // Reset state for the new (symbol, interval).
    candlesRef.current = [];
    hasMoreBackwardRef.current = true;
    setEndOfHistoryTs(null);
    indicatorHandlesRef.current.clear();
    subchartPaneOrderRef.current = [];
    const myReq = ++reqIdRef.current;

    // Initial fetch: latest N bars up to now.
    void (async () => {
      try {
        const res = await loadBars({
          symbol,
          interval,
          type: 'init',
          timestamp: Math.floor(Date.now() / 1000),
        });
        if (myReq !== reqIdRef.current) return;
        ingestBars(res.bars, 'init');
        hasMoreBackwardRef.current = res.hasMoreBackward;
        if (!res.hasMoreBackward && res.bars.length > 0) {
          setEndOfHistoryTs(res.bars[0].time);
        }
        // Glue latest bar to right edge with breathing room.
        chart.timeScale().scrollToRealTime();
      } catch {
        // silent — leave the chart blank
      }
    })();

    // Pan-left detection.
    const onRangeChange = chart.timeScale().subscribeVisibleTimeRangeChange(() => {
      maybeFetchBackward();
    });
    void onRangeChange;

    // ResizeObserver — re-measure on container width changes.
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        chart.applyOptions({ width: ref.current!.clientWidth });
        recomputeOverlayBtns();
      });
    });
    ro.observe(ref.current);
    raf = requestAnimationFrame(() => {
      chart.applyOptions({ width: ref.current!.clientWidth });
    });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      indicatorHandlesRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval]);

  // ---------------------------------------------------------------
  // Re-apply candle theme on convention flip without rebuilding.
  // ---------------------------------------------------------------
  useEffect(() => {
    if (candleSeriesRef.current) {
      candleSeriesRef.current.applyOptions(candleColorOpts(candleConvention));
    }
  }, [candleConvention]);

  // ---------------------------------------------------------------
  // Diff overlays + subcharts on store change.
  // ---------------------------------------------------------------
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const wantOverlay = new Set(overlays);
    const wantSubchart = new Set(subcharts);
    const handles = indicatorHandlesRef.current;

    // Remove indicators no longer wanted.
    for (const [name, h] of handles) {
      const def = getIndicatorDef(name);
      if (!def) {
        // Stale entry — just remove its series.
        for (const s of h.seriesHandles) chart.removeSeries(s);
        handles.delete(name);
        continue;
      }
      const wanted =
        def.kind === 'overlay' ? wantOverlay.has(name) : wantSubchart.has(name);
      if (!wanted) {
        for (const s of h.seriesHandles) chart.removeSeries(s);
        handles.delete(name);
        if (def.kind === 'subchart') {
          // Find pane index by position in subchartPaneOrderRef +1 (candle is pane 0).
          const idx = subchartPaneOrderRef.current.indexOf(name);
          if (idx >= 0) {
            chart.removePane(idx + 1);
            subchartPaneOrderRef.current.splice(idx, 1);
          }
        }
      }
    }

    // Add indicators newly wanted.
    for (const name of overlays) {
      if (handles.has(name)) continue;
      addIndicator(name);
    }
    for (const name of subcharts) {
      if (handles.has(name)) continue;
      addIndicator(name);
    }

    requestAnimationFrame(recomputeOverlayBtns);
    // Include `symbol` + `interval` in deps so this effect re-runs after
    // every chart rebuild (mount effect cleared `indicatorHandlesRef` on
    // those changes — without re-running this diff, the new chart
    // renders blank but the store still says the indicators are
    // "selected", and toggling any indicator re-adds the WHOLE store
    // selection at once, surprising the user).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlays, subcharts, symbol, interval]);

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------

  const addIndicator = useCallback((name: string) => {
    const chart = chartRef.current;
    const def = getIndicatorDef(name);
    if (!chart || !def) return;
    let paneIndex: number;
    if (def.kind === 'overlay') {
      paneIndex = 0;
    } else {
      // Each subchart gets its own new pane below the candle pane.
      const newPane = chart.addPane(true);
      paneIndex = newPane.paneIndex();
      subchartPaneOrderRef.current.push(name);
    }
    const series: ReturnType<IChartApi['addSeries']>[] = [];
    const api = createPaneRenderApi(chart, paneIndex, series);
    const result = def.compute(candlesRef.current, def.defaults);
    const handle = def.render(api, result);
    indicatorHandlesRef.current.set(name, {
      ...handle,
      paneIndex: def.kind === 'overlay' ? null : paneIndex,
    });
  }, []);

  /**
   * Push fresh bars into the chart + recompute every active indicator.
   * Called on init (whole array replaces) and on backward (older bars
   * prepended, deduped by timestamp).
   */
  const ingestBars = (incoming: KlineCandle[], mode: 'init' | 'backward') => {
    const candleSeries = candleSeriesRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !chart) return;
    const cur = candlesRef.current;
    if (mode === 'init') {
      candlesRef.current = incoming.map(toCandle);
    } else {
      // Prepend older bars; dedup by ts.
      const seen = new Set(cur.map((c) => c.time));
      const merged = incoming.map(toCandle).filter((c) => !seen.has(c.time));
      candlesRef.current = [...merged, ...cur];
    }
    const next = candlesRef.current;
    candleSeries.setData(
      next.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    // Recompute every active indicator (cheap — pure functions over the
    // bar array).
    for (const [name, h] of indicatorHandlesRef.current) {
      const def = getIndicatorDef(name);
      if (!def) continue;
      const result = def.compute(next, def.defaults);
      // For each named series, find the matching handle by index in
      // the `seriesHandles` array.  We rely on render()'s ordering
      // matching Object.keys(result.series) — true for every
      // indicator file in the registry (renders in the same order
      // it builds the series record).
      const seriesEntries = Object.entries(result.series);
      for (let i = 0; i < seriesEntries.length && i < h.seriesHandles.length; i++) {
        const [, points] = seriesEntries[i];
        const handle = h.seriesHandles[i];
        // setData accepts WhitespaceData[] | LineData[] | etc.
        // Cast loosely — each indicator's series shape is its own
        // responsibility.
        (handle as ISeriesApi<'Line'>).setData(points as never);
      }
    }
  };

  const maybeFetchBackward = () => {
    const chart = chartRef.current;
    if (!chart) return;
    if (!hasMoreBackwardRef.current) return;
    if (fetchingRef.current) return;
    if (candlesRef.current.length === 0) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      const range = chart.timeScale().getVisibleLogicalRange();
      if (!range) return;
      // Trigger when leftmost rendered logical position is within
      // PAGE_LIMIT_TRIGGER_BARS bars of the start.
      if (range.from > PAGE_LIMIT_TRIGGER_BARS) return;
      fetchingRef.current = true;
      const oldest = candlesRef.current[0].time;
      const myReq = reqIdRef.current;
      void (async () => {
        try {
          const res = await loadBars({
            symbol,
            interval,
            type: 'backward',
            timestamp: oldest,
          });
          if (myReq !== reqIdRef.current) return;
          ingestBars(res.bars, 'backward');
          hasMoreBackwardRef.current = res.hasMoreBackward;
          if (!res.hasMoreBackward && candlesRef.current.length > 0) {
            setEndOfHistoryTs(candlesRef.current[0].time);
          }
        } catch {
          // silent
        } finally {
          fetchingRef.current = false;
        }
      })();
    }, HISTORY_DEBOUNCE_MS);
  };

  const recomputeOverlayBtns = () => {
    const chart = chartRef.current;
    if (!chart) {
      setOverlayBtns([]);
      return;
    }
    const next: PaneOverlayBtn[] = [];
    let cumTop = 0;
    const panes = chart.panes();
    for (let i = 0; i < panes.length; i++) {
      const sz = chart.paneSize(i);
      if (i > 0) {
        // pane index i corresponds to subchartPaneOrderRef.current[i-1]
        const name = subchartPaneOrderRef.current[i - 1];
        if (name) {
          next.push({ paneIndex: i, name, top: cumTop });
        }
      }
      cumTop += sz.height;
    }
    setOverlayBtns(next);
  };

  return (
    <div className="relative" style={{ width: '100%', height }}>
      <div ref={ref} style={{ width: '100%', height: '100%' }} />
      {overlayBtns.map((b) => (
        <button
          key={`${b.paneIndex}:${b.name}`}
          onClick={() => removeSubchart(b.name)}
          aria-label={`Remove ${b.name} subchart`}
          title={`Remove ${b.name}`}
          style={{
            position: 'absolute',
            top: b.top + 4,
            right: 8,
            width: 20,
            height: 20,
            zIndex: 10,
          }}
          className={
            'flex items-center justify-center rounded-sm bg-surface-tertiary/80 ' +
            'text-fg-primary text-[12px] leading-none ' +
            'hover:bg-[color:var(--accent-red-dim)] hover:text-accent-red ' +
            'transition-colors'
          }
        >
          ×
        </button>
      ))}
      {/* End-of-history badge — surfaces "we've loaded the oldest
          bar the backend has, here's its date" so users understand
          the boundary is the data layer, not a chart bug. */}
      {endOfHistoryTs != null && (
        <div
          className={
            'absolute left-2 bottom-7 z-10 px-2 py-0.5 rounded-sm ' +
            'bg-surface-tertiary/85 border border-border-subtle ' +
            'text-[10px] font-mono text-fg-muted leading-none whitespace-nowrap ' +
            'pointer-events-none'
          }
          title="后端聚合器最早的可用 K 线 — 想看更早历史需要扩大 data-aggregator 的回填窗口"
        >
          已加载到最早数据 · {formatBoundaryDate(endOfHistoryTs)}
        </div>
      )}
    </div>
  );
}

function formatBoundaryDate(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function candleColorOpts(candleConvention: string) {
  const up =
    candleConvention === 'red-up' ? readToken('--accent-red') : readToken('--accent-green');
  const down =
    candleConvention === 'red-up' ? readToken('--accent-green') : readToken('--accent-red');
  return {
    upColor: up,
    downColor: down,
    borderUpColor: up,
    borderDownColor: down,
    wickUpColor: up,
    wickDownColor: down,
    borderVisible: false,
  };
}
