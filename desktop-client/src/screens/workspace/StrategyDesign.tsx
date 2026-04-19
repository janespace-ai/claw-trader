import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { IndicatorPane } from './IndicatorPane';
import { AIPanel } from '@/components/chat/AIPanel';

type Interval = '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

type FetchState = 'loading' | 'empty' | 'ready';

const OVERLAY_SET: ReadonlySet<string> = new Set<OverlayIndicatorId>([
  'SMA20', 'SMA50', 'SMA200', 'EMA12', 'EMA26', 'BB', 'VWAP', 'DONCHIAN',
]);

function isPane(id: IndicatorId): id is PaneIndicatorId {
  return !OVERLAY_SET.has(id);
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
        <div className="flex flex-col gap-3 p-4">
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
              />

              {activePanes.includes('RSI') && (
                <IndicatorPane
                  title="RSI (14)"
                  latestLabel={rsiData.at(-1)?.value.toFixed(1) ?? '—'}
                  lines={[{ data: rsiData, color: 'var(--accent-primary)' }]}
                  domain={{ min: 0, max: 100 }}
                  guides={[
                    { value: 70, color: 'var(--accent-red)' },
                    { value: 30, color: 'var(--accent-green)' },
                    { value: 50, color: 'var(--border-subtle)', dashed: false },
                  ]}
                />
              )}
              {activePanes.includes('MACD') && macdData && (
                <IndicatorPane
                  title="MACD (12, 26, 9)"
                  latestLabel={macdData.macd.at(-1)?.value.toFixed(2) ?? '—'}
                  lines={[
                    { data: macdData.macd, color: 'var(--accent-primary)' },
                    { data: macdData.signal, color: 'var(--accent-yellow)' },
                  ]}
                  guides={[{ value: 0, color: 'var(--border-subtle)', dashed: false }]}
                  histogram={macdData.histogram}
                />
              )}
              {activePanes.includes('STOCH') && stochData && (
                <IndicatorPane
                  title="Stochastic (14, 3)"
                  latestLabel={stochData.k.at(-1)?.value.toFixed(1) ?? '—'}
                  lines={[
                    { data: stochData.k, color: 'var(--accent-primary)' },
                    { data: stochData.d, color: 'var(--accent-yellow)' },
                  ]}
                  domain={{ min: 0, max: 100 }}
                  guides={[
                    { value: 80, color: 'var(--accent-red)' },
                    { value: 20, color: 'var(--accent-green)' },
                  ]}
                />
              )}
              {activePanes.includes('ATR') && atrData.length > 0 && (
                <IndicatorPane
                  title="ATR (14)"
                  latestLabel={atrData.at(-1)?.value.toFixed(2) ?? '—'}
                  lines={[{ data: atrData, color: 'var(--accent-yellow)' }]}
                />
              )}
              {activePanes.includes('OBV') && obvData.length > 0 && (
                <IndicatorPane
                  title="OBV"
                  latestLabel={obvData.at(-1)?.value.toFixed(0) ?? '—'}
                  lines={[{ data: obvData, color: 'var(--accent-primary)' }]}
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
