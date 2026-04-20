import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IChartApi, Time } from 'lightweight-charts';
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
} from '@/services/indicators';
import { StrategyTopbar } from './StrategyTopbar';
import { StrategyDraftCard } from './StrategyDraftCard';
import { RunPreviewCard } from './RunPreviewCard';
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
  'SMA20', 'SMA50', 'SMA200', 'EMA12', 'EMA26', 'BB', 'VWAP', 'DONCHIAN',
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

  // --- Chart data ----------------------------------------------------------
  useEffect(() => {
    const to = Math.floor(Date.now() / 1000);
    const from = to - 30 * 24 * 3600;
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
    return out;
  }, [klines, indicators]);

  // --- Separate panes (RSI / MACD / STOCH / ATR / OBV) --------------------
  const activePanes = indicators.filter(isPane);

  const rsiData = useMemo(
    () => (indicators.includes('RSI') && klines.length ? rsi(klines, 14) : []),
    [klines, indicators],
  );
  const macdData = useMemo(
    () => (indicators.includes('MACD') && klines.length ? macd(klines, 12, 26, 9) : null),
    [klines, indicators],
  );
  const stochData = useMemo(
    () => (indicators.includes('STOCH') && klines.length ? stochastic(klines, 14, 3) : null),
    [klines, indicators],
  );
  const atrData = useMemo(
    () => (indicators.includes('ATR') && klines.length ? atr(klines, 14) : []),
    [klines, indicators],
  );
  const obvData = useMemo(
    () => (indicators.includes('OBV') && klines.length ? obv(klines) : []),
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
    const handler = (range: { from: Time; to: Time } | null) => {
      if (!range || syncingRef.current) return;
      syncingRef.current = true;
      try {
        for (const [otherId, otherChart] of chartsRef.current.entries()) {
          if (otherId === id) continue;
          otherChart.timeScale().setVisibleRange(range);
        }
      } finally {
        // Release after the cascading setVisibleRange calls have
        // had their subscribers execute. Deferring to rAF (rather
        // than clearing synchronously) prevents the flag from
        // resetting before lightweight-charts finishes propagating.
        requestAnimationFrame(() => {
          syncingRef.current = false;
        });
      }
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(handler);

    // If the user has already zoomed the main chart, a just-toggled-on
    // pane needs to inherit that range immediately rather than
    // fit-to-content'ing its own data. Copy the current main-chart
    // range onto the new chart once its data is likely present.
    if (id !== 'main') {
      const main = chartsRef.current.get('main');
      if (main) {
        requestAnimationFrame(() => {
          const currentRange = main.timeScale().getVisibleRange();
          if (currentRange) {
            syncingRef.current = true;
            chart.timeScale().setVisibleRange(currentRange);
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

  return (
    <WorkspaceShell
      topbar={
        <StrategyTopbar
          symbol={focusedSymbol}
          onSymbolChange={handleSymbolChange}
          interval={interval}
          onIntervalChange={setInterval}
          onRunPreview={handleRunPreview}
          canRunPreview={canRunPreview}
          isRunning={isRunning}
        />
      }
      main={
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
                height={360}
                showVolume
                onChartReady={(c) => registerChart('main', c)}
                priceScaleMinWidth={SHARED_PRICE_SCALE_WIDTH}
              />

              {activePanes.includes('RSI') && (
                <IndicatorChartPane
                  title="RSI"
                  params="(14)"
                  values={[
                    {
                      text: rsiData.at(-1)?.value.toFixed(2) ?? '—',
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
                  onChartReady={(c) => registerChart('pane:RSI', c)}
                />
              )}
              {activePanes.includes('MACD') && macdData && (
                <IndicatorChartPane
                  title="MACD"
                  params="(12, 26, 9)"
                  values={[
                    {
                      text: macdData.macd.at(-1)?.value.toFixed(2) ?? '—',
                      color: 'var(--accent-primary)',
                    },
                    {
                      text: macdData.signal.at(-1)?.value.toFixed(2) ?? '—',
                      color: 'var(--accent-yellow)',
                    },
                    {
                      text: macdData.histogram.at(-1)?.value.toFixed(2) ?? '—',
                      color:
                        (macdData.histogram.at(-1)?.value ?? 0) >= 0
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
                  onChartReady={(c) => registerChart('pane:MACD', c)}
                />
              )}
              {activePanes.includes('STOCH') && stochData && (
                <IndicatorChartPane
                  title="Stochastic"
                  params="(14, 3)"
                  values={[
                    {
                      text: 'K ' + (stochData.k.at(-1)?.value.toFixed(1) ?? '—'),
                      color: 'var(--accent-primary)',
                    },
                    {
                      text: 'D ' + (stochData.d.at(-1)?.value.toFixed(1) ?? '—'),
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
                  onChartReady={(c) => registerChart('pane:STOCH', c)}
                />
              )}
              {activePanes.includes('ATR') && atrData.length > 0 && (
                <IndicatorChartPane
                  title="ATR"
                  params="(14)"
                  values={[
                    {
                      text: atrData.at(-1)?.value.toFixed(2) ?? '—',
                      color: 'var(--accent-yellow)',
                    },
                  ]}
                  lines={[{ data: atrData, color: 'var(--accent-yellow)' }]}
                  showTimeAxis={lastPane === 'ATR'}
                  priceScaleMinWidth={SHARED_PRICE_SCALE_WIDTH}
                  onChartReady={(c) => registerChart('pane:ATR', c)}
                />
              )}
              {activePanes.includes('OBV') && obvData.length > 0 && (
                <IndicatorChartPane
                  title="OBV"
                  values={[
                    {
                      text: obvData.at(-1)?.value.toFixed(0) ?? '—',
                      color: 'var(--accent-primary)',
                    },
                  ]}
                  lines={[{ data: obvData, color: 'var(--accent-primary)' }]}
                  showTimeAxis={lastPane === 'OBV'}
                  priceScaleMinWidth={SHARED_PRICE_SCALE_WIDTH}
                  onChartReady={(c) => registerChart('pane:OBV', c)}
                />
              )}
            </>
          )}

          <ChartIndicatorBar
            selected={indicators}
            onToggle={handleToggleIndicator}
          />

          <div className="grid grid-cols-2 gap-4">
            <StrategyDraftCard />
            <RunPreviewCard
              onRunPreview={handleRunPreview}
              isRunning={isRunning}
              lastError={lastError}
            />
          </div>
        </div>
      }
      rightRail={
        <AIPersonaShell
          persona="strategist"
          context={{ focusedSymbol, interval, indicators }}
        >
          <div className="flex-1 overflow-hidden">
            <AIPanel />
          </div>
        </AIPersonaShell>
      }
    />
  );
}
