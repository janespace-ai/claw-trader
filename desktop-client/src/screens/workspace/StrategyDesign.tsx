import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IChartApi, LogicalRange } from 'lightweight-charts';
import type { IndicatorPoint, IndicatorSeriesPoint } from '@/services/indicators';
import {
  AIPersonaShell,
  ClawChart,
  WorkspaceShell,
  type CandlePoint,
  type OverlayLine,
} from '@/components/primitives';
import { cremote, toErrorBody } from '@/services/remote/contract-client';
import { useAppStore } from '@/stores/appStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useWorkspaceDraftStore } from '@/stores/workspaceDraftStore';
import {
  sma,
  ema,
  bollinger,
  rsi,
  macd,
  stochastic,
  atr,
  obv,
  vwap,
  donchian,
  kdj,
  sar,
  cci,
  williamsR,
  mfi,
  roc,
} from '@/services/indicators';
import { StrategyDraftCard } from './StrategyDraftCard';
import { RunPreviewCard } from './RunPreviewCard';
import { MarketStrip, computeRollingStats } from '@/components/workspace/MarketStrip';
import { SymbolList } from '@/components/workspace/SymbolList';
import { TimeframeBar } from '@/components/workspace/TimeframeBar';
import { ResizeHandle } from '@/components/workspace/ResizeHandle';
import type { components } from '@/types/api';
import {
  ChartIndicatorBar,
  type IndicatorId,
  type OverlayIndicatorId,
  type PaneIndicatorId,
} from './ChartIndicatorBar';
import { IndicatorChartPane } from './IndicatorChartPane';
import { AIPanel } from '@/components/chat/AIPanel';

type Interval = '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

type FetchState = 'loading' | 'empty' | 'ready';

const OVERLAY_SET: ReadonlySet<string> = new Set<OverlayIndicatorId>([
  'SMA20', 'SMA50', 'SMA200', 'EMA12', 'EMA26', 'BB', 'VWAP', 'DONCHIAN', 'SAR',
]);

function isPane(id: IndicatorId): id is PaneIndicatorId {
  return !OVERLAY_SET.has(id);
}

/** Forced common width for every chart's right price scale. Accommodates
 *  both 6-digit dollar prices ("75,380.4") and shorter indicator labels
 *  ("60.00"). Using the same value across the main chart and every pane
 *  means their plot areas line up horizontally regardless of which
 *  labels happen to be in view. */
const SHARED_PRICE_SCALE_WIDTH = 68;

/**
 * Align a sparse indicator series (which only emits values for bars
 * after the warmup period) to the full candle-time grid, filling the
 * warmup bars with `value: null` so the chart receives whitespace
 * points instead of skipping those logical indices.
 *
 * This is what keeps cross-chart logical-range sync in register even
 * when the user pans past the last bar — every chart has the same
 * number of points, so logical index N refers to the same moment on
 * candles, RSI, MACD, etc.
 */
function alignToCandles(
  sparse: IndicatorPoint[],
  candles: CandlePoint[],
): IndicatorSeriesPoint[] {
  if (candles.length === 0) return [];
  const byTs = new Map<number, number>();
  for (const p of sparse) byTs.set(p.ts, p.value);
  return candles.map((c) => ({
    ts: c.ts,
    value: byTs.has(c.ts) ? byTs.get(c.ts)! : null,
  }));
}

/** Read the latest numeric value in a padded series — skips any
 *  trailing whitespace (unlikely since indicators stabilise by the
 *  last bar, but safe against edge cases). */
function latestValue(series: IndicatorSeriesPoint[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].value != null) return series[i].value;
  }
  return null;
}

function fmt(v: number | null, digits = 2): string {
  return v == null ? '—' : v.toFixed(digits);
}

/**
 * Workspace — Strategy Design screen.
 * Pencil frame `Q6cKp` (dark) / `MZuaq` (light).
 */
export function StrategyDesign() {
  const { t } = useTranslation();

  const focusedSymbol =
    useWorkspaceStore((s) => s.focusedSymbol) ?? 'BTC_USDT';
  const setFocus = useWorkspaceStore((s) => s.focus);
  const currentStrategyId = useWorkspaceStore((s) => s.currentStrategyId);
  const enterPreview = useWorkspaceStore((s) => s.enterPreview);
  const navigate = useAppStore((s) => s.navigate);

  const [interval, setInterval] = useState<Interval>('1h');
  const [indicators, setIndicators] = useState<IndicatorId[]>([]);
  const [klines, setKlines] = useState<CandlePoint[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [isRunning, setIsRunning] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<components['schemas']['SymbolMetadata'] | null>(null);

  // --- Resizable pane heights --------------------------------------------
  // The main chart and each active indicator pane own their own height
  // state so the user can drag the thin bar between them to grow/shrink
  // either side. Heights are clamped in `resizeMain` / `resizePane` so
  // a runaway drag can't collapse a chart to zero or push it past a
  // reasonable viewport size.
  const MIN_CHART_HEIGHT = 120;
  const MAX_CHART_HEIGHT = 900;
  const MIN_PANE_HEIGHT = 60;
  const MAX_PANE_HEIGHT = 400;
  const [mainHeight, setMainHeight] = useState<number>(360);
  const [paneHeights, setPaneHeights] = useState<Record<string, number>>({});
  const clamp = (v: number, lo: number, hi: number) =>
    v < lo ? lo : v > hi ? hi : v;
  const resizeMain = (dy: number) => {
    setMainHeight((h) => clamp(h + dy, MIN_CHART_HEIGHT, MAX_CHART_HEIGHT));
  };
  const resizePane = (id: string, dy: number) => {
    setPaneHeights((prev) => {
      const cur = prev[id] ?? 100;
      return { ...prev, [id]: clamp(cur + dy, MIN_PANE_HEIGHT, MAX_PANE_HEIGHT) };
    });
  };
  const paneHeight = (id: string) => paneHeights[id] ?? 100;

  // --- Symbol metadata (drives the market-info strip) ---------------------
  useEffect(() => {
    let cancelled = false;
    cremote
      .getSymbolMetadata({ symbol: focusedSymbol })
      .then((m) => {
        if (!cancelled) setMetadata(m);
      })
      .catch(() => {
        if (!cancelled) setMetadata(null);
      });
    return () => {
      cancelled = true;
    };
  }, [focusedSymbol]);

  // How many bars of lookback to pre-fetch on mount / symbol change.
  // 30 days × 24h = 720 bars on 1h interval; scales proportionally for
  // other intervals.
  const INITIAL_WINDOW_SEC = 30 * 24 * 3600;
  // How many additional days to fetch each time the user drags past
  // the earliest loaded bar.
  const LAZY_WINDOW_SEC = 30 * 24 * 3600;
  // When the visible logical range's `from` drops below this many bars
  // from the left edge of the dataset, kick off another lazy load.
  const LAZY_TRIGGER_BARS = 30;

  // --- Chart data ----------------------------------------------------------
  useEffect(() => {
    const to = Math.floor(Date.now() / 1000);
    const from = to - INITIAL_WINDOW_SEC;
    let cancelled = false;
    setFetchState('loading');
    cremote
      .getKlines({
        symbol: focusedSymbol,
        interval,
        from,
        to,
        market: 'futures',
      })
      .then((rows) => {
        if (cancelled) return;
        const next = rows.map((k) => ({
          ts: k.ts,
          o: k.o,
          h: k.h,
          l: k.l,
          c: k.c,
          v: k.v,
        }));
        setKlines(next);
        setFetchState(next.length === 0 ? 'empty' : 'ready');
      })
      .catch(() => {
        if (cancelled) return;
        setKlines([]);
        setFetchState('empty');
      });
    return () => {
      cancelled = true;
    };
  }, [focusedSymbol, interval]);

  // --- Lazy-load older klines ---------------------------------------------
  // When the user drags the chart to reveal earlier history and gets
  // within `LAZY_TRIGGER_BARS` of the leftmost bar, we fetch another
  // `LAZY_WINDOW_SEC` of historical candles and prepend them to
  // `klines`. A ref-based guard keeps multiple near-simultaneous range
  // events from firing concurrent fetches; an `exhausted` flag stops
  // us from infinite-looping when the backend runs out of history.
  const loadingOlderRef = useRef(false);
  const exhaustedRef = useRef(false);
  const klinesRef = useRef<CandlePoint[]>([]);
  klinesRef.current = klines;
  const symbolIntervalRef = useRef({ symbol: focusedSymbol, interval });
  symbolIntervalRef.current = { symbol: focusedSymbol, interval };

  // Reset lazy-load state whenever the user switches symbol or interval.
  useEffect(() => {
    loadingOlderRef.current = false;
    exhaustedRef.current = false;
  }, [focusedSymbol, interval]);

  const loadOlderKlines = useCallback(async () => {
    if (loadingOlderRef.current || exhaustedRef.current) return;
    const existing = klinesRef.current;
    if (existing.length === 0) return;

    loadingOlderRef.current = true;
    try {
      const { symbol, interval: iv } = symbolIntervalRef.current;
      const oldestTs = existing[0].ts;
      const to = oldestTs - 1;
      const from = to - LAZY_WINDOW_SEC;
      const older = await cremote.getKlines({
        symbol,
        interval: iv,
        from,
        to,
        market: 'futures',
      });
      // Defensive dedupe in case backend returned the boundary candle.
      const firstExistingTs = existing[0].ts;
      const prepend = older
        .filter((k) => k.ts < firstExistingTs)
        .map((k) => ({
          ts: k.ts,
          o: k.o,
          h: k.h,
          l: k.l,
          c: k.c,
          v: k.v,
        }));

      if (prepend.length === 0) {
        // Backend has no more data at this depth — stop asking.
        exhaustedRef.current = true;
        return;
      }

      // Capture the user's current logical window BEFORE the React
      // state update triggers `setData` on the main chart; we'll shift
      // it right by the number of prepended bars so the view stays
      // pinned to the same moment in time (logical indices shift by
      // exactly `prepend.length`).
      const mainChart = chartsRef.current.get('main');
      const savedRange = mainChart?.timeScale().getVisibleLogicalRange();

      setKlines((prev) => [...prepend, ...prev]);

      if (mainChart && savedRange) {
        // After React commits and all the charts have re-run their
        // data effects, restore the shifted range. Wrapping with
        // `syncingRef` suppresses the cascade that would otherwise
        // fire from the main chart's own range-change subscriber.
        requestAnimationFrame(() => {
          syncingRef.current = true;
          const shift = prepend.length;
          const nextRange = {
            from: savedRange.from + shift,
            to: savedRange.to + shift,
          };
          for (const [, c] of chartsRef.current.entries()) {
            c.timeScale().setVisibleLogicalRange(nextRange);
          }
          requestAnimationFrame(() => {
            syncingRef.current = false;
          });
        });
      }
    } catch {
      // Swallow network errors; the user can retry by dragging again.
    } finally {
      loadingOlderRef.current = false;
    }
  }, []);

  // --- Indicator overlays --------------------------------------------------
  const overlayLines: OverlayLine[] = useMemo(() => {
    if (klines.length === 0) return [];
    const out: OverlayLine[] = [];
    if (indicators.includes('SMA20')) {
      out.push({ id: 'sma-20', data: sma(klines, 20), color: 'var(--accent-primary)', lineWidth: 2 });
    }
    if (indicators.includes('SMA50')) {
      out.push({ id: 'sma-50', data: sma(klines, 50), color: 'var(--accent-yellow)', lineWidth: 2 });
    }
    if (indicators.includes('SMA200')) {
      out.push({ id: 'sma-200', data: sma(klines, 200), color: 'var(--accent-red)', lineWidth: 2 });
    }
    if (indicators.includes('EMA12')) {
      out.push({ id: 'ema-12', data: ema(klines, 12), color: 'var(--accent-green)', lineWidth: 2 });
    }
    if (indicators.includes('EMA26')) {
      out.push({ id: 'ema-26', data: ema(klines, 26), color: 'var(--accent-primary)', lineWidth: 2 });
    }
    if (indicators.includes('BB')) {
      const { upper, middle, lower } = bollinger(klines, 20, 2);
      out.push(
        { id: 'bb-upper', data: upper, color: 'var(--accent-red)', lineWidth: 1 },
        { id: 'bb-mid', data: middle, color: 'var(--fg-muted)', lineWidth: 1 },
        { id: 'bb-lower', data: lower, color: 'var(--accent-green)', lineWidth: 1 },
      );
    }
    if (indicators.includes('VWAP')) {
      out.push({ id: 'vwap', data: vwap(klines, 20), color: 'var(--accent-yellow)', lineWidth: 2 });
    }
    if (indicators.includes('DONCHIAN')) {
      const d = donchian(klines, 20);
      out.push(
        { id: 'dc-upper', data: d.upper, color: 'var(--accent-primary)', lineWidth: 1 },
        { id: 'dc-mid', data: d.middle, color: 'var(--fg-muted)', lineWidth: 1 },
        { id: 'dc-lower', data: d.lower, color: 'var(--accent-primary)', lineWidth: 1 },
      );
    }
    if (indicators.includes('SAR')) {
      // SAR renders as a thin dotted line; lightweight-charts doesn't
      // do point scatter natively, so we use a 1-wide line series
      // which visually reads as dots tracking above/below price.
      out.push({
        id: 'sar',
        data: sar(klines, 0.02, 0.2),
        color: 'var(--accent-yellow)',
        lineWidth: 1,
      });
    }
    return out;
  }, [klines, indicators]);

  // --- Separate panes (RSI / MACD / STOCH / ATR / OBV) --------------------
  const activePanes = indicators.filter(isPane);

  // Each memo computes the raw (sparse) series, then pads it to the
  // full candle grid via `alignToCandles` so downstream logical-range
  // sync stays consistent — logical index N refers to the same moment
  // on every chart. Warmup bars become whitespace points in the pane.
  const rsiData = useMemo(
    () => (indicators.includes('RSI') && klines.length ? alignToCandles(rsi(klines, 14), klines) : []),
    [klines, indicators],
  );
  const macdData = useMemo(() => {
    if (!indicators.includes('MACD') || klines.length === 0) return null;
    const raw = macd(klines, 12, 26, 9);
    return {
      macd: alignToCandles(raw.macd, klines),
      signal: alignToCandles(raw.signal, klines),
      histogram: alignToCandles(raw.histogram, klines),
    };
  }, [klines, indicators]);
  const stochData = useMemo(() => {
    if (!indicators.includes('STOCH') || klines.length === 0) return null;
    const raw = stochastic(klines, 14, 3);
    return {
      k: alignToCandles(raw.k, klines),
      d: alignToCandles(raw.d, klines),
    };
  }, [klines, indicators]);
  const atrData = useMemo(
    () => (indicators.includes('ATR') && klines.length ? alignToCandles(atr(klines, 14), klines) : []),
    [klines, indicators],
  );
  const obvData = useMemo(
    () => (indicators.includes('OBV') && klines.length ? alignToCandles(obv(klines), klines) : []),
    [klines, indicators],
  );
  const kdjData = useMemo(() => {
    if (!indicators.includes('KDJ') || klines.length === 0) return null;
    const raw = kdj(klines, 9, 3);
    return {
      k: alignToCandles(raw.k, klines),
      d: alignToCandles(raw.d, klines),
      j: alignToCandles(raw.j, klines),
    };
  }, [klines, indicators]);
  const cciData = useMemo(
    () => (indicators.includes('CCI') && klines.length ? alignToCandles(cci(klines, 20), klines) : []),
    [klines, indicators],
  );
  const wrData = useMemo(
    () => (indicators.includes('WR') && klines.length ? alignToCandles(williamsR(klines, 14), klines) : []),
    [klines, indicators],
  );
  const mfiData = useMemo(
    () => (indicators.includes('MFI') && klines.length ? alignToCandles(mfi(klines, 14), klines) : []),
    [klines, indicators],
  );
  const rocData = useMemo(
    () => (indicators.includes('ROC') && klines.length ? alignToCandles(roc(klines, 12), klines) : []),
    [klines, indicators],
  );

  // --- Time-scale sync across main chart + all indicator panes ------------
  // Every chart we mount registers itself here; a single shared handler
  // on each chart mirrors the user's zoom / pan to every other chart.
  // `syncingRef` breaks the feedback loop that would otherwise fire
  // when `setVisibleRange` triggers the target chart's own subscribers.
  const chartsRef = useRef<Map<string, IChartApi>>(new Map());
  const syncingRef = useRef(false);

  const registerChart = useCallback((id: string, chart: IChartApi) => {
    chartsRef.current.set(id, chart);
    // Logical-range sync (not time-range) so panning past the last
    // bar still keeps every pane in lockstep. Every chart is padded
    // to the same logical length via `alignToCandles`, so logical
    // index N refers to the same moment everywhere — `setVisibleLogicalRange`
    // won't be silently clamped to a chart's own data end the way
    // `setVisibleRange` was.
    const handler = (range: LogicalRange | null) => {
      if (!range || syncingRef.current) return;
      syncingRef.current = true;
      try {
        for (const [otherId, otherChart] of chartsRef.current.entries()) {
          if (otherId === id) continue;
          otherChart.timeScale().setVisibleLogicalRange(range);
        }
      } finally {
        // Release after the cascading calls have had their
        // subscribers execute. Deferring to rAF rather than clearing
        // synchronously prevents the flag from resetting before
        // lightweight-charts finishes propagating the change.
        requestAnimationFrame(() => {
          syncingRef.current = false;
        });
      }

      // Lazy-load older history — only the main chart triggers this;
      // pane charts derive their data from `klines` via indicators, so
      // they'd just react to the parent state update.
      if (id === 'main' && range.from < LAZY_TRIGGER_BARS) {
        void loadOlderKlines();
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);

    // If the user has already zoomed the main chart, a just-toggled-on
    // pane needs to inherit that range immediately rather than
    // fit-to-content'ing its own data. Copy the current main-chart
    // logical range onto the new chart once its data is likely present.
    if (id !== 'main') {
      const main = chartsRef.current.get('main');
      if (main) {
        requestAnimationFrame(() => {
          const currentRange = main.timeScale().getVisibleLogicalRange();
          if (currentRange) {
            syncingRef.current = true;
            chart.timeScale().setVisibleLogicalRange(currentRange);
            requestAnimationFrame(() => {
              syncingRef.current = false;
            });
          }
        });
      }
    }
  }, []);

  // Prune chart registry entries whose panes are no longer active so
  // removed panes don't receive stale sync events. The pane itself
  // handles `chart.remove()` via its unmount cleanup.
  useEffect(() => {
    const registry = chartsRef.current;
    const activeIds = new Set<string>(['main', ...activePanes.map((p) => `pane:${p}`)]);
    for (const id of Array.from(registry.keys())) {
      if (!activeIds.has(id)) registry.delete(id);
    }
  }, [activePanes]);

  // --- Run Preview ---------------------------------------------------------
  const draftCode = useWorkspaceDraftStore((s) => s.code);
  const draftStrategyId = useWorkspaceDraftStore((s) => s.strategyId);
  const canRunPreview = !!draftCode;

  const handleRunPreview = useCallback(async () => {
    if (!draftCode) return;
    setIsRunning(true);
    setLastError(null);
    try {
      const task = await cremote.startBacktest({
        code: draftCode,
        config: {
          symbols: [focusedSymbol],
          interval,
          from: Math.floor(Date.now() / 1000) - 7 * 24 * 3600,
          to: Math.floor(Date.now() / 1000),
        },
        strategy_id: draftStrategyId ?? currentStrategyId ?? undefined,
      });
      enterPreview(draftStrategyId ?? currentStrategyId ?? '', task.task_id);
    } catch (err) {
      const body = toErrorBody(err);
      setLastError(`${body.code}: ${body.message}`);
    } finally {
      setIsRunning(false);
    }
  }, [
    draftCode,
    draftStrategyId,
    currentStrategyId,
    focusedSymbol,
    interval,
    enterPreview,
  ]);

  // --- Symbol switch → reload chart (effect above handles it) --------------
  const handleSymbolChange = (s: string) => {
    setFocus(s);
  };

  const handleToggleIndicator = (ind: IndicatorId) => {
    setIndicators((prev) =>
      prev.includes(ind) ? prev.filter((x) => x !== ind) : [...prev, ind],
    );
  };

  void navigate;

  // The bottom-most active pane is the only one that shows its time
  // axis — Gate / TradingView-style where stacked panes share a single
  // axis at the foot of the group rather than repeating it on every
  // strip.
  const lastPane = activePanes.at(-1);

  // "Indicators" button on the timeframe bar scrolls the indicator
  // picker (which renders beneath the chart) into view, giving the
  // bar a functional handle without duplicating the picker UI.
  const indicatorBarRef = useRef<HTMLDivElement | null>(null);
  const handleOpenIndicators = useCallback(() => {
    indicatorBarRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, []);

  // Primary CTA that now lives inside the AI persona header instead of
  // in a dedicated workspace topbar. Keeps the chart area maximally
  // tall (no empty 52px row above it) while still giving the Run
  // Preview button a prominent, always-visible home.
  const runPreviewButton = (
    <button
      type="button"
      onClick={handleRunPreview}
      disabled={!canRunPreview || isRunning}
      className={[
        'px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
        canRunPreview && !isRunning
          ? 'bg-accent-primary text-fg-inverse hover:opacity-90'
          : 'bg-surface-tertiary text-fg-muted cursor-not-allowed',
      ].join(' ')}
    >
      {isRunning ? '…' : '✦ ' + t('workspace.design.run_preview')}
    </button>
  );

  return (
    <WorkspaceShell
      leftRail={
        <SymbolList
          focusedSymbol={focusedSymbol}
          onSelect={handleSymbolChange}
        />
      }
      main={
        <div className="flex flex-col">
          {/* Gate-style market info strip: favourite star, ticker
              dropdown, price, 24h change, high/low, volume, max
              leverage, funding rate. Spans edge-to-edge above the
              chart area; matches Pencil `MktStrip` (1wUsP). */}
          <MarketStrip
            metadata={metadata}
            symbol={focusedSymbol}
            onSymbolChange={handleSymbolChange}
            rollingStats={computeRollingStats(klines)}
            baseCurrency={focusedSymbol.split('_')[0] ?? 'base'}
          />
          {/* Dedicated timeframe + chart-controls row — Pencil `TfBar`
              (LXpUp). Sits between the market strip and the chart so
              users can switch intervals without hunting in the topbar. */}
          <TimeframeBar
            interval={interval}
            onIntervalChange={setInterval}
            indicatorsActive={indicators.length > 0}
            onOpenIndicators={handleOpenIndicators}
          />
        <div className="flex flex-col gap-2 p-4">
          {fetchState === 'empty' ? (
            <div
              className="flex flex-col items-center justify-center gap-2 border border-dashed border-border-subtle rounded-md text-fg-muted text-xs"
              style={{ height: 360 }}
            >
              <span className="font-mono text-sm">{focusedSymbol} · {interval}</span>
              <span>
                {t('chart.no_data_for_interval', {
                  defaultValue:
                    'No candle data available for this interval. Try a longer timeframe (1h / 4h / 1d).',
                })}
              </span>
            </div>
          ) : (
            <>
              <ClawChart.Candles
                data={klines}
                overlays={overlayLines}
                height={mainHeight}
                showVolume
                onChartReady={(c) => registerChart('main', c)}
                priceScaleMinWidth={SHARED_PRICE_SCALE_WIDTH}
              />
              <ResizeHandle
                onResize={resizeMain}
                ariaLabel={t('chart.resize_main', { defaultValue: 'Resize chart' })}
              />

              {activePanes.includes('RSI') && (
                <IndicatorChartPane
                  title="RSI"
                  params="(14)"
                  values={[
                    {
                      text: fmt(latestValue(rsiData)),
                      color: 'var(--accent-primary)',
                    },
                  ]}
                  lines={[{ data: rsiData, color: 'var(--accent-primary)' }]}
                  guides={[
                    { value: 70, color: 'var(--accent-red)' },
                    { value: 30, color: 'var(--accent-green)' },
                    { value: 50, color: 'var(--border-subtle)', dashed: false },
                  ]}
                  showTimeAxis={lastPane === 'RSI'}
                  priceScaleMinWidth={SHARED_PRICE_SCALE_WIDTH}
                  height={paneHeight('RSI')}
                  onChartReady={(c) => registerChart('pane:RSI', c)}
                />
              )}
              {activePanes.includes('RSI') && (
                <ResizeHandle
                  onResize={(dy) => resizePane('RSI', dy)}
                  ariaLabel={t('chart.resize_pane', { defaultValue: 'Resize RSI pane', name: 'RSI' })}
                />
              )}
              {activePanes.includes('MACD') && macdData && (
                <IndicatorChartPane
                  title="MACD"
                  params="(12, 26, 9)"
                  values={[
                    {
                      text: fmt(latestValue(macdData.macd)),
                      color: 'var(--accent-primary)',
                    },
                    {
                      text: fmt(latestValue(macdData.signal)),
                      color: 'var(--accent-yellow)',
                    },
                    {
                      text: fmt(latestValue(macdData.histogram)),
                      color:
                        (latestValue(macdData.histogram) ?? 0) >= 0
                          ? 'var(--accent-green)'
                          : 'var(--accent-red)',
                    },
                  ]}
                  lines={[
                    { data: macdData.macd, color: 'var(--accent-primary)' },
                    { data: macdData.signal, color: 'var(--accent-yellow)' },
                  ]}
                  histogram={macdData.histogram}
                  guides={[{ value: 0, color: 'var(--border-subtle)', dashed: false }]}
                  showTimeAxis={lastPane === 'MACD'}
                  priceScaleMinWidth={SHARED_PRICE_SCALE_WIDTH}
                  height={paneHeight('MACD')}
                  onChartReady={(c) => registerChart('pane:MACD', c)}
                />
              )}
              {activePanes.includes('MACD') && (
                <ResizeHandle
                  onResize={(dy) => resizePane('MACD', dy)}
                  ariaLabel={t('chart.resize_pane', { defaultValue: 'Resize MACD pane', name: 'MACD' })}
                />
              )}
              {activePanes.includes('STOCH') && stochData && (
                <IndicatorChartPane
                  title="Stochastic"
                  params="(14, 3)"
                  values={[
                    {
                      text: 'K ' + fmt(latestValue(stochData.k), 1),
                      color: 'var(--accent-primary)',
                    },
                    {
                      text: 'D ' + fmt(latestValue(stochData.d), 1),
                      color: 'var(--accent-yellow)',
                    },
                  ]}
                  lines={[
                    { data: stochData.k, color: 'var(--accent-primary)' },
                    { data: stochData.d, color: 'var(--accent-yellow)' },
                  ]}
                  guides={[
                    { value: 80, color: 'var(--accent-red)' },
                    { value: 20, color: 'var(--accent-green)' },
                  ]}
                  showTimeAxis={lastPane === 'STOCH'}
                  priceScaleMinWidth={SHARED_PRICE_SCALE_WIDTH}
                  height={paneHeight('STOCH')}
                  onChartReady={(c) => registerChart('pane:STOCH', c)}
                />
              )}
              {activePanes.includes('STOCH') && (
                <ResizeHandle
                  onResize={(dy) => resizePane('STOCH', dy)}
                  ariaLabel={t('chart.resize_pane', { defaultValue: 'Resize STOCH pane', name: 'STOCH' })}
                />
              )}
              {activePanes.includes('ATR') && atrData.length > 0 && (
                <IndicatorChartPane
                  title="ATR"
                  params="(14)"
                  values={[
                    {
                      text: fmt(latestValue(atrData)),
                      color: 'var(--accent-yellow)',
                    },
                  ]}
                  lines={[{ data: atrData, color: 'var(--accent-yellow)' }]}
                  showTimeAxis={lastPane === 'ATR'}
                  priceScaleMinWidth={SHARED_PRICE_SCALE_WIDTH}
                  height={paneHeight('ATR')}
                  onChartReady={(c) => registerChart('pane:ATR', c)}
                />
              )}
              {activePanes.includes('ATR') && (
                <ResizeHandle
                  onResize={(dy) => resizePane('ATR', dy)}
                  ariaLabel={t('chart.resize_pane', { defaultValue: 'Resize ATR pane', name: 'ATR' })}
                />
              )}
              {activePanes.includes('OBV') && obvData.length > 0 && (
                <IndicatorChartPane
                  title="OBV"
                  values={[
                    {
                      text: fmt(latestValue(obvData), 0),
                      color: 'var(--accent-primary)',
                    },
                  ]}
                  lines={[{ data: obvData, color: 'var(--accent-primary)' }]}
                  showTimeAxis={lastPane === 'OBV'}
                  priceScaleMinWidth={SHARED_PRICE_SCALE_WIDTH}
                  height={paneHeight('OBV')}
                  onChartReady={(c) => registerChart('pane:OBV', c)}
                />
              )}
              {activePanes.includes('OBV') && (
                <ResizeHandle
                  onResize={(dy) => resizePane('OBV', dy)}
                  ariaLabel={t('chart.resize_pane', { defaultValue: 'Resize OBV pane', name: 'OBV' })}
                />
              )}
              {activePanes.includes('KDJ') && kdjData && (
                <IndicatorChartPane
                  title="KDJ"
                  params="(9, 3)"
                  values={[
                    { text: 'K ' + fmt(latestValue(kdjData.k), 1), color: 'var(--accent-primary)' },
                    { text: 'D ' + fmt(latestValue(kdjData.d), 1), color: 'var(--accent-yellow)' },
                    { text: 'J ' + fmt(latestValue(kdjData.j), 1), color: 'var(--accent-green)' },
                  ]}
                  lines={[
                    { data: kdjData.k, color: 'var(--accent-primary)' },
                    { data: kdjData.d, color: 'var(--accent-yellow)' },
                    { data: kdjData.j, color: 'var(--accent-green)' },
                  ]}
                  guides={[
                    { value: 80, color: 'var(--accent-red)' },
                    { value: 20, color: 'var(--accent-green)' },
                  ]}
                  showTimeAxis={lastPane === 'KDJ'}
                  priceScaleMinWidth={SHARED_PRICE_SCALE_WIDTH}
                  height={paneHeight('KDJ')}
                  onChartReady={(c) => registerChart('pane:KDJ', c)}
                />
              )}
              {activePanes.includes('KDJ') && (
                <ResizeHandle
                  onResize={(dy) => resizePane('KDJ', dy)}
                  ariaLabel={t('chart.resize_pane', { defaultValue: 'Resize KDJ pane', name: 'KDJ' })}
                />
              )}
              {activePanes.includes('CCI') && cciData.length > 0 && (
                <IndicatorChartPane
                  title="CCI"
                  params="(20)"
                  values={[
                    { text: fmt(latestValue(cciData), 1), color: 'var(--accent-primary)' },
                  ]}
                  lines={[{ data: cciData, color: 'var(--accent-primary)' }]}
                  guides={[
                    { value: 100, color: 'var(--accent-red)' },
                    { value: -100, color: 'var(--accent-green)' },
                    { value: 0, color: 'var(--border-subtle)', dashed: false },
                  ]}
                  showTimeAxis={lastPane === 'CCI'}
                  priceScaleMinWidth={SHARED_PRICE_SCALE_WIDTH}
                  height={paneHeight('CCI')}
                  onChartReady={(c) => registerChart('pane:CCI', c)}
                />
              )}
              {activePanes.includes('CCI') && (
                <ResizeHandle
                  onResize={(dy) => resizePane('CCI', dy)}
                  ariaLabel={t('chart.resize_pane', { defaultValue: 'Resize CCI pane', name: 'CCI' })}
                />
              )}
              {activePanes.includes('WR') && wrData.length > 0 && (
                <IndicatorChartPane
                  title="W%R"
                  params="(14)"
                  values={[
                    { text: fmt(latestValue(wrData), 1), color: 'var(--accent-primary)' },
                  ]}
                  lines={[{ data: wrData, color: 'var(--accent-primary)' }]}
                  guides={[
                    { value: -20, color: 'var(--accent-red)' },
                    { value: -80, color: 'var(--accent-green)' },
                  ]}
                  showTimeAxis={lastPane === 'WR'}
                  priceScaleMinWidth={SHARED_PRICE_SCALE_WIDTH}
                  height={paneHeight('WR')}
                  onChartReady={(c) => registerChart('pane:WR', c)}
                />
              )}
              {activePanes.includes('WR') && (
                <ResizeHandle
                  onResize={(dy) => resizePane('WR', dy)}
                  ariaLabel={t('chart.resize_pane', { defaultValue: 'Resize WR pane', name: 'WR' })}
                />
              )}
              {activePanes.includes('MFI') && mfiData.length > 0 && (
                <IndicatorChartPane
                  title="MFI"
                  params="(14)"
                  values={[
                    { text: fmt(latestValue(mfiData), 1), color: 'var(--accent-primary)' },
                  ]}
                  lines={[{ data: mfiData, color: 'var(--accent-primary)' }]}
                  guides={[
                    { value: 80, color: 'var(--accent-red)' },
                    { value: 20, color: 'var(--accent-green)' },
                  ]}
                  showTimeAxis={lastPane === 'MFI'}
                  priceScaleMinWidth={SHARED_PRICE_SCALE_WIDTH}
                  height={paneHeight('MFI')}
                  onChartReady={(c) => registerChart('pane:MFI', c)}
                />
              )}
              {activePanes.includes('MFI') && (
                <ResizeHandle
                  onResize={(dy) => resizePane('MFI', dy)}
                  ariaLabel={t('chart.resize_pane', { defaultValue: 'Resize MFI pane', name: 'MFI' })}
                />
              )}
              {activePanes.includes('ROC') && rocData.length > 0 && (
                <IndicatorChartPane
                  title="ROC"
                  params="(12)"
                  values={[
                    { text: fmt(latestValue(rocData), 2), color: 'var(--accent-yellow)' },
                  ]}
                  lines={[{ data: rocData, color: 'var(--accent-yellow)' }]}
                  guides={[{ value: 0, color: 'var(--border-subtle)', dashed: false }]}
                  showTimeAxis={lastPane === 'ROC'}
                  priceScaleMinWidth={SHARED_PRICE_SCALE_WIDTH}
                  height={paneHeight('ROC')}
                  onChartReady={(c) => registerChart('pane:ROC', c)}
                />
              )}
              {activePanes.includes('ROC') && (
                <ResizeHandle
                  onResize={(dy) => resizePane('ROC', dy)}
                  ariaLabel={t('chart.resize_pane', { defaultValue: 'Resize ROC pane', name: 'ROC' })}
                />
              )}
            </>
          )}

          <div ref={indicatorBarRef}>
            <ChartIndicatorBar
              selected={indicators}
              onToggle={handleToggleIndicator}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <StrategyDraftCard />
            <RunPreviewCard
              onRunPreview={handleRunPreview}
              isRunning={isRunning}
              lastError={lastError}
            />
          </div>
        </div>
        </div>
      }
      rightRail={
        <AIPersonaShell
          persona="strategist"
          context={{ focusedSymbol, interval, indicators }}
          headerAction={runPreviewButton}
        >
          <div className="flex-1 overflow-hidden">
            <AIPanel />
          </div>
        </AIPersonaShell>
      }
    />
  );
}
