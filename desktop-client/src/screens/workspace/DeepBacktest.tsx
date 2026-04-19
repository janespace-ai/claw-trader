import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AIPersonaShell,
  ClawChart,
  MetricsGrid,
  Watchlist,
  WorkspaceShell,
  type Metric,
  type MonthlyReturn,
} from '@/components/primitives';
import { TradesTab } from '@/components/workspace/TradesTab';
import { cremote } from '@/services/remote/contract-client';
import { useAppStore } from '@/stores/appStore';
import { useOptimLensStore } from '@/stores/optimlensStore';
import { useWorkspaceDraftStore } from '@/stores/workspaceDraftStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { DeepTopbar } from './DeepTopbar';
import { ImprovementList } from './ImprovementList';
import { MetricsTab } from './MetricsTab';
import { MonthlyTab } from './MonthlyTab';
import { OptimizeModal } from './OptimizeModal';
import type { components } from '@/types/api';

type BacktestResult = components['schemas']['BacktestResult'];
type MetricsExt = components['schemas']['MetricsBlockExtended'];
type Trade = components['schemas']['Trade'];

type Tab = 'metrics' | 'trades' | 'monthly';
const TAB_KEY = 'workspace.deep.tab';

function readInitialTab(): Tab {
  if (typeof localStorage === 'undefined') return 'metrics';
  const raw = localStorage.getItem(TAB_KEY);
  return raw === 'trades' || raw === 'monthly' ? raw : 'metrics';
}

/**
 * Workspace — Deep Backtest screen.
 * Pencil frame `QdrlI` (dark) / `TR0Ib` (light).
 */
export function DeepBacktest() {
  const focusedSymbol = useWorkspaceStore((s) => s.focusedSymbol) ?? 'BTC_USDT';
  const setFocus = useWorkspaceStore((s) => s.focus);
  const currentTaskId = useWorkspaceStore((s) => s.currentTaskId);
  const currentStrategyId = useWorkspaceStore((s) => s.currentStrategyId);
  const draftCode = useWorkspaceDraftStore((s) => s.code);
  const draftSummary = useWorkspaceDraftStore((s) => s.summary);
  const draftName = useWorkspaceDraftStore((s) => s.name);
  const draftParams = useWorkspaceDraftStore((s) => s.params);
  const navigate = useAppStore((s) => s.navigate);

  const [tab, setTab] = useState<Tab>(readInitialTab());
  useEffect(() => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  const [result, setResult] = useState<BacktestResult | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const startOptim = useOptimLensStore((s) => s.start);
  const optimEntry = useOptimLensStore((s) =>
    currentStrategyId ? s.byStrategy[currentStrategyId] : undefined,
  );

  // --- Fetch backtest result --------------------------------------------
  useEffect(() => {
    if (!currentTaskId) return;
    let cancelled = false;
    cremote
      .getBacktestResult({ task_id: currentTaskId })
      .then((task) => {
        if (cancelled) return;
        setResult((task.result as BacktestResult | undefined) ?? null);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTaskId]);

  const allTrades: Trade[] = result?.trades ?? [];
  const metrics: MetricsExt | undefined = result?.metrics as MetricsExt | undefined;
  const equity = result?.equity_curve ?? [];

  const uniqueSymbols = useMemo(
    () => Array.from(new Set(allTrades.map((t) => t.symbol))),
    [allTrades],
  );

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

  // Monthly returns: derive from trades for now (backend change will
  // expose summary.monthly_returns directly).
  const monthlyReturns: MonthlyReturn[] = useMemo(() => {
    const byMonth = new Map<string, { pnl: number; trades: number }>();
    for (const t of allTrades) {
      const ts = t.exit_ts ?? t.entry_ts;
      const d = new Date(ts * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const cur = byMonth.get(key) ?? { pnl: 0, trades: 0 };
      cur.pnl += t.pnl_pct ?? 0;
      cur.trades += 1;
      byMonth.set(key, cur);
    }
    return Array.from(byMonth.entries()).map(([month, s]) => ({
      month,
      value: s.pnl,
      trades: s.trades,
    }));
  }, [allTrades]);

  const summaryLabel = useMemo(() => {
    if (!metrics) return 'Deep backtest pending';
    const ret = metrics.total_return != null ? (metrics.total_return * 100).toFixed(1) + '%' : '—';
    const sharpe = metrics.sharpe != null ? metrics.sharpe.toFixed(2) : '—';
    return `Deep complete · ${ret} return · Sharpe ${sharpe} · ${allTrades.length} trades`;
  }, [metrics, allTrades.length]);

  // --- Optimize flow -----------------------------------------------------
  const paramsSchema: Record<string, unknown> = useMemo(() => {
    if (draftSummary?.params) return draftSummary.params;
    return draftParams ?? {};
  }, [draftSummary, draftParams]);

  const handleOptimizeSubmit = useCallback(
    async (grid: Record<string, number[]>) => {
      if (!currentStrategyId) return;
      setModalOpen(false);
      await startOptim(currentStrategyId, {
        strategy_id: currentStrategyId,
        symbols: uniqueSymbols.length ? uniqueSymbols : [focusedSymbol],
        lookback_days: 180,
        param_grid: grid,
      });
    },
    [currentStrategyId, uniqueSymbols, focusedSymbol, startOptim],
  );

  const isOptimizing = optimEntry?.status === 'pending' || optimEntry?.status === 'running';
  const canOptimize = Object.entries(paramsSchema).some(([, v]) => typeof v === 'number');

  // --- Headline metrics bar ---------------------------------------------
  const headline: Metric[] = useMemo(() => {
    const m = metrics ?? {};
    const pct = (v: number | null | undefined) => (v == null ? null : v * 100);
    return [
      { label: 'Total Return', value: pct(m.total_return) as number | null, unit: '%' },
      { label: 'Sharpe', value: m.sharpe ?? null },
      { label: 'Max DD', value: pct(m.max_drawdown) as number | null, unit: '%' },
      { label: 'Win Rate', value: pct(m.win_rate) as number | null, unit: '%' },
      { label: 'Profit Factor', value: m.profit_factor ?? null },
      { label: 'Trades', value: m.total_trades ?? null },
    ];
  }, [metrics]);

  void draftCode;
  void draftName;
  void navigate;

  return (
    <>
    <WorkspaceShell
      topbar={
        <DeepTopbar
          strategyName={draftName || 'Strategy'}
          summaryLabel={summaryLabel}
          onOptimize={() => setModalOpen(true)}
          isOptimizing={isOptimizing}
          canOptimize={canOptimize}
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
          <ClawChart.Equity data={equity} height={300} />
          <MetricsGrid metrics={headline} minColWidth={160} />
          <div className="flex items-center gap-2 border-b border-border-subtle">
            {(
              [
                ['metrics', 'Metrics'],
                ['trades', 'Trades'],
                ['monthly', 'Monthly'],
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
          {tab === 'metrics' && <MetricsTab metrics={metrics} />}
          {tab === 'trades' && (
            <TradesTab
              trades={allTrades}
              selectedSymbol={focusedSymbol}
              onRowClick={(t) => {
                if (t.symbol !== focusedSymbol) setFocus(t.symbol);
              }}
            />
          )}
          {tab === 'monthly' && <MonthlyTab data={monthlyReturns} />}
        </div>
      }
      rightRail={
        <AIPersonaShell
          persona="optimlens"
          context={{ focusedSymbol, strategyId: currentStrategyId }}
        >
          <div className="flex-1 overflow-y-auto p-3">
            {currentStrategyId ? (
              <ImprovementList strategyId={currentStrategyId} />
            ) : (
              <div className="text-xs text-fg-muted italic">
                No current strategy context.
              </div>
            )}
          </div>
        </AIPersonaShell>
      }
    />
    {modalOpen && (
      <OptimizeModal
        paramsSchema={paramsSchema}
        symbols={uniqueSymbols.length ? uniqueSymbols : [focusedSymbol]}
        onCancel={() => setModalOpen(false)}
        onSubmit={handleOptimizeSubmit}
      />
    )}
    </>
  );
}
