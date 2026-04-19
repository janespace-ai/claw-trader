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
import { sma, ema, bollinger, rsi, type IndicatorPoint } from '@/services/indicators';
import { StrategyTopbar } from './StrategyTopbar';
import { StrategyDraftCard } from './StrategyDraftCard';
import { RunPreviewCard } from './RunPreviewCard';
import { ChartIndicatorBar, type IndicatorId } from './ChartIndicatorBar';
import { RSIPane } from './RSIPane';
import { AIPanel } from '@/components/chat/AIPanel';

type Interval = '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

type FetchState = 'loading' | 'empty' | 'ready';

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

  // --- Indicator overlays (SMA / EMA / BB) and RSI pane --------------------
  const overlayLines: OverlayLine[] = useMemo(() => {
    if (klines.length === 0) return [];
    const out: OverlayLine[] = [];
    if (indicators.includes('SMA')) {
      out.push({
        id: 'sma-20',
        data: sma(klines, 20),
        color: 'var(--accent-primary)',
        lineWidth: 2,
      });
    }
    if (indicators.includes('EMA')) {
      out.push({
        id: 'ema-20',
        data: ema(klines, 20),
        color: 'var(--accent-yellow)',
        lineWidth: 2,
      });
    }
    if (indicators.includes('BB')) {
      const { upper, middle, lower } = bollinger(klines, 20, 2);
      out.push(
        { id: 'bb-upper', data: upper, color: 'var(--accent-red)', lineWidth: 1 },
        { id: 'bb-mid', data: middle, color: 'var(--fg-muted)', lineWidth: 1 },
        { id: 'bb-lower', data: lower, color: 'var(--accent-green)', lineWidth: 1 },
      );
    }
    return out;
  }, [klines, indicators]);

  const rsiData: IndicatorPoint[] = useMemo(() => {
    if (!indicators.includes('RSI') || klines.length === 0) return [];
    return rsi(klines, 14);
  }, [klines, indicators]);

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
        <div className="flex flex-col gap-4 p-4">
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
              {indicators.includes('RSI') && <RSIPane data={rsiData} />}
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
