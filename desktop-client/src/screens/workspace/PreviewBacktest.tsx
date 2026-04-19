import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AIPersonaShell,
  ClawChart,
  WorkspaceShell,
  Watchlist,
  type CandlePoint,
  type ChartMarker,
} from '@/components/primitives';
import { cremote, toErrorBody } from '@/services/remote/contract-client';
import { useAppStore } from '@/stores/appStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useWorkspaceDraftStore } from '@/stores/workspaceDraftStore';
import { useSignalReviewStore } from '@/stores/signalReviewStore';
import { useAutoSignalReview } from '@/stores/useAutoSignalReview';
import { VerdictList } from '@/components/chat/VerdictList';
import { PreviewTopbar } from './PreviewTopbar';
import { TradesTab } from '@/components/workspace/TradesTab';
import { QuickMetricsTab } from './QuickMetricsTab';
import type { components } from '@/types/api';

type Trade = components['schemas']['Trade'];
type BacktestResult = components['schemas']['BacktestResult'];
type MetricsBlock = components['schemas']['MetricsBlock'];

type Tab = 'trades' | 'metrics' | 'review';
const TAB_KEY = 'workspace.preview.tab';

function readInitialTab(): Tab {
  if (typeof localStorage === 'undefined') return 'trades';
  const raw = localStorage.getItem(TAB_KEY);
  return raw === 'metrics' || raw === 'review' ? raw : 'trades';
}

/**
 * Workspace — Preview Backtest screen.
 * Pencil frame `3PSG8` (dark) / `PISBa` (light).
 */
export function PreviewBacktest() {
  const focusedSymbol = useWorkspaceStore((s) => s.focusedSymbol) ?? 'BTC_USDT';
  const setFocus = useWorkspaceStore((s) => s.focus);
  const currentStrategyId = useWorkspaceStore((s) => s.currentStrategyId);
  const currentTaskId = useWorkspaceStore((s) => s.currentTaskId);
  const enterDeep = useWorkspaceStore((s) => s.enterDeep);
  const navigate = useAppStore((s) => s.navigate);

  // Auto-start Signal Review once per taskId.
  useAutoSignalReview(currentTaskId);

  const reviewEntry = useSignalReviewStore((s) =>
    currentTaskId ? s.byBacktestTask[currentTaskId] : undefined,
  );
  const selectVerdict = useSignalReviewStore((s) => s.selectVerdict);
  const pulseSignal = useSignalReviewStore((s) => s.pulseSignal);

  const draftCode = useWorkspaceDraftStore((s) => s.code);

  const [tab, setTab] = useState<Tab>(readInitialTab());
  useEffect(() => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  const [klines, setKlines] = useState<CandlePoint[]>([]);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [isRunningDeep, setIsRunningDeep] = useState(false);
  const [deepError, setDeepError] = useState<string | null>(null);

  // --- Fetch backtest result ---------------------------------------------
  useEffect(() => {
    if (!currentTaskId) return;
    let cancelled = false;
    cremote
      .getBacktestResult({ task_id: currentTaskId })
      .then((task) => {
        if (cancelled) return;
        const r = (task.result as BacktestResult | undefined) ?? null;
        setResult(r);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTaskId]);

  // --- Fetch klines for the focused symbol -------------------------------
  useEffect(() => {
    const to = Math.floor(Date.now() / 1000);
    const from = to - 7 * 24 * 3600;
    let cancelled = false;
    cremote
      .getKlines({
        symbol: focusedSymbol,
        interval: '1h',
        from,
        to,
        market: 'futures',
      })
      .then((rows) => {
        if (cancelled) return;
        setKlines(
          rows.map((k) => ({ ts: k.ts, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v })),
        );
      })
      .catch(() => {
        if (!cancelled) setKlines([]);
      });
    return () => {
      cancelled = true;
    };
  }, [focusedSymbol]);

  // --- Derived views -----------------------------------------------------
  const tradesForSymbol: Trade[] = useMemo(() => {
    if (!result?.trades) return [];
    return result.trades.filter((t) => t.symbol === focusedSymbol);
  }, [result, focusedSymbol]);

  const allTrades: Trade[] = result?.trades ?? [];
  const metrics: MetricsBlock | undefined = result?.metrics;

  const markers: ChartMarker[] = useMemo(() => {
    return tradesForSymbol.flatMap((t) => {
      const entry: ChartMarker = {
        ts: t.entry_ts,
        position: t.side === 'long' ? 'belowBar' : 'aboveBar',
        shape: t.side === 'long' ? 'arrowUp' : 'arrowDown',
        text: t.side === 'long' ? 'L' : 'S',
      };
      const out: ChartMarker[] = [entry];
      if (t.exit_ts != null) {
        out.push({
          ts: t.exit_ts,
          position: 'aboveBar',
          shape: 'circle',
          text: t.pnl_pct != null ? (t.pnl_pct >= 0 ? '+' : '-') : '·',
        });
      }
      return out;
    });
  }, [tradesForSymbol]);

  // Build per-symbol watchlist from result.trades grouped by symbol.
  const perSymbolItems = useMemo(() => {
    const by = new Map<string, { total: number; winners: number; pnl: number }>();
    for (const t of allTrades) {
      const cur = by.get(t.symbol) ?? { total: 0, winners: 0, pnl: 0 };
      cur.total += 1;
      if ((t.pnl_pct ?? 0) > 0) cur.winners += 1;
      cur.pnl += t.pnl_pct ?? 0;
      by.set(t.symbol, cur);
    }
    return Array.from(by.entries()).map(([symbol, s]) => ({
      symbol,
      badge: `${s.winners}/${s.total}`,
      stat: (s.pnl * 100).toFixed(2) + '%',
      statColor: s.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
    }));
  }, [allTrades]);

  const uniqueSymbols = useMemo(
    () => Array.from(new Set(allTrades.map((t) => t.symbol))),
    [allTrades],
  );

  // --- Cross-nav: verdict click → focus symbol + pulse ------------------
  const handleVerdictSelect = useCallback(
    (signalId: string) => {
      if (!currentTaskId || !reviewEntry) return;
      const v = reviewEntry.verdicts.find((x) => x.signal_id === signalId);
      if (!v) return;
      selectVerdict(currentTaskId, signalId);
      if (v.symbol !== focusedSymbol) {
        setFocus(v.symbol);
      }
      pulseSignal(currentTaskId, signalId);
    },
    [currentTaskId, reviewEntry, selectVerdict, setFocus, focusedSymbol, pulseSignal],
  );

  // --- Confirm + Run Deep ------------------------------------------------
  const handleConfirmDeep = useCallback(async () => {
    if (!draftCode) {
      setDeepError('No strategy code in draft');
      return;
    }
    setIsRunningDeep(true);
    setDeepError(null);
    try {
      const task = await cremote.startBacktest({
        code: draftCode,
        config: {
          symbols: uniqueSymbols.length ? uniqueSymbols : [focusedSymbol],
          interval: '1h',
          from: Math.floor(Date.now() / 1000) - 90 * 24 * 3600,
          to: Math.floor(Date.now() / 1000),
        },
        strategy_id: currentStrategyId ?? undefined,
      });
      enterDeep(task.task_id);
    } catch (err) {
      const body = toErrorBody(err);
      setDeepError(`${body.code}: ${body.message}`);
    } finally {
      setIsRunningDeep(false);
    }
  }, [draftCode, uniqueSymbols, focusedSymbol, currentStrategyId, enterDeep]);

  void navigate;

  const windowLabel = 'last 7 days';

  return (
    <WorkspaceShell
      topbar={
        <PreviewTopbar
          symbol={focusedSymbol}
          windowLabel={windowLabel}
          signalsTotal={allTrades.length}
          symbolsTotal={uniqueSymbols.length}
          onConfirmDeep={handleConfirmDeep}
          isRunningDeep={isRunningDeep}
        />
      }
      leftRail={
        <div className="p-3">
          <Watchlist
            items={perSymbolItems}
            focused={focusedSymbol}
            onFocus={setFocus}
          />
        </div>
      }
      main={
        <div className="flex flex-col gap-4 p-4">
          <ClawChart.Candles data={klines} markers={markers} height={340} showVolume />
          {reviewEntry?.status === 'unavailable' && (
            <div className="text-[11px] text-fg-muted border border-border-subtle rounded-md px-3 py-2">
              Signal Review backend not available yet — the screen still reflects
              backend-produced trades and metrics.
            </div>
          )}
          {deepError && (
            <div className="text-xs text-accent-red">{deepError}</div>
          )}
          <div className="flex items-center gap-2 border-b border-border-subtle">
            {(
              [
                ['trades', 'Trades'],
                ['metrics', 'Quick Metrics'],
                ['review', 'AI Review'],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={
                  'px-3 py-2 text-xs font-medium ' +
                  (tab === key
                    ? 'text-fg-primary border-b-2 border-accent-primary'
                    : 'text-fg-secondary hover:text-fg-primary')
                }
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'trades' && (
            <TradesTab
              trades={allTrades}
              selectedSymbol={focusedSymbol}
              onRowClick={(t) => {
                if (t.symbol !== focusedSymbol) setFocus(t.symbol);
              }}
            />
          )}
          {tab === 'metrics' && <QuickMetricsTab metrics={metrics} />}
          {tab === 'review' && (
            <VerdictList
              verdicts={reviewEntry?.verdicts ?? []}
              selectedId={reviewEntry?.selectedSignalId ?? null}
              onSelect={handleVerdictSelect}
              layout="table"
            />
          )}
        </div>
      }
      rightRail={
        <AIPersonaShell persona="signal-review" context={{ focusedSymbol, taskId: currentTaskId }}>
          <div className="flex flex-col gap-3 p-3 overflow-y-auto">
            <div className="text-[11px] text-fg-muted">
              {reviewEntry?.status === 'complete'
                ? `${reviewEntry.verdicts.length} verdicts`
                : reviewEntry?.status === 'running' || reviewEntry?.status === 'pending'
                  ? 'Scanning entries…'
                  : reviewEntry?.status === 'unavailable'
                    ? 'Review backend unavailable'
                    : reviewEntry?.status === 'failed'
                      ? (reviewEntry.error ?? 'Review failed')
                      : 'Idle'}
            </div>
            <VerdictList
              verdicts={reviewEntry?.verdicts ?? []}
              selectedId={reviewEntry?.selectedSignalId ?? null}
              onSelect={handleVerdictSelect}
              layout="compact"
            />
          </div>
        </AIPersonaShell>
      }
    />
  );
}
