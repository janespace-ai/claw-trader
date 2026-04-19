import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStrategyStore } from '@/stores/strategyStore';
import { useCoinListStore } from '@/stores/coinListStore';
import { useBacktestStore } from '@/stores/backtestStore';
import { KlineChart, type KlineCandle } from '@/components/charts/KlineChart';
import { EquityCurve } from '@/components/charts/EquityCurve';
import { DrawdownCurve, computeDrawdown } from '@/components/charts/DrawdownCurve';
import { MonthlyHeatmap } from '@/components/charts/MonthlyHeatmap';
import { SymbolRankingTable } from '@/components/backtest/SymbolRankingTable';
import { TradeList } from '@/components/backtest/TradeList';
// SymbolDetailPage was removed in the `symbol-detail` change — its
// functionality lives in `screens/SymbolDetailScreen.tsx` behind the
// `route.kind === "symbol-detail"` route. This legacy BacktestPage is
// itself orphaned (not routed after workspace-* changes landed) but
// kept compiling for safety until deletion in a follow-up.
import { useAppStore } from '@/stores/appStore';
import type { Trade, BacktestResultRecord } from '@/types/domain';

type Dimension = 'all' | 'long' | 'short';

function useLoadLatestResult(strategyId: string | undefined) {
  const loadCached = useBacktestStore((s) => s.loadCached);
  const cached = useBacktestStore((s) => s.cached);
  useEffect(() => {
    void loadCached(strategyId);
  }, [strategyId, loadCached]);
  return cached[0] as BacktestResultRecord | undefined;
}

export function BacktestPage() {
  const { t } = useTranslation();
  const current = useStrategyStore((s) => s.current);
  const strategies = useStrategyStore((s) => s.list);
  const setCurrent = useStrategyStore((s) => s.setCurrent);
  const symbols = useCoinListStore((s) => s.symbols);
  const setSymbols = useCoinListStore((s) => s.set);

  const phase = useBacktestStore((s) => s.phase);
  const progress = useBacktestStore((s) => s.progress);
  const storeResult = useBacktestStore((s) => s.result);
  const runPreview = useBacktestStore((s) => s.runPreview);
  const runDeep = useBacktestStore((s) => s.runDeep);

  const [interval, setInterval] = useState('1h');
  const [dimension, setDimension] = useState<Dimension>('all');
  const [drilldownSymbol, setDrilldownSymbol] = useState<string | null>(null);

  // On first mount: if no current strategy, pick the first seeded one; if no
  // symbols selected, populate from the cached backtest result for visual demo.
  useEffect(() => {
    if (!current && strategies.length > 0) {
      const firstStrategy = strategies.find((s) => s.type === 'strategy') ?? strategies[0];
      setCurrent(firstStrategy);
    }
  }, [current, strategies, setCurrent]);

  const latestCached = useLoadLatestResult(current?.id);

  useEffect(() => {
    if (symbols.length === 0 && latestCached?.symbols?.length) {
      setSymbols(latestCached.symbols);
    }
  }, [symbols, latestCached, setSymbols]);

  // Prefer live run result over cached.
  const effective = storeResult?.result ?? latestCached ?? null;
  const summary = (effective as any)?.summary_metrics ?? (effective as any)?.metrics ?? null;
  const perSymbol = (effective as any)?.per_symbol_metrics ?? (effective as any)?.per_symbol ?? {};
  const equity = (effective as any)?.equity_curve ?? [];
  const trades: Trade[] = (effective as any)?.trades ?? [];

  const drawdown = useMemo(() => computeDrawdown(equity), [equity]);

  const metrics = summary?.[dimension] ?? summary?.all ?? null;

  const ready = !!current && symbols.length > 0;

  const triggerPreview = () => {
    if (!current) return;
    const toDate = new Date();
    const fromDate = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    void runPreview(current.id, current.code, {
      symbols, interval,
      from: fromDate.toISOString(), to: toDate.toISOString(),
      initial_capital: 10_000, commission: 0.0006, slippage: 0.0001, fill_mode: 'close',
    });
  };
  const triggerDeep = () => {
    if (!current) return;
    const toDate = new Date();
    const fromDate = new Date(Date.now() - 180 * 24 * 3600 * 1000);
    void runDeep(current.id, current.code, {
      symbols, interval,
      from: fromDate.toISOString(), to: toDate.toISOString(),
      initial_capital: 10_000, commission: 0.0006, slippage: 0.0001, fill_mode: 'close',
    });
  };

  const setTab = useAppStore((s) => s.setTab);

  // Legacy drill-down: the dedicated `SymbolDetailScreen` now owns this
  // experience. This branch is a no-op placeholder kept to avoid a
  // larger refactor of BacktestPage (which is already orphaned).
  void drilldownSymbol;
  void latestCached;
  void setDrilldownSymbol;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="font-heading text-xl font-semibold">
            {current?.name ?? t('strategy.draft')}
          </div>
          <div className="text-xs text-fg-muted mt-1">
            {symbols.length} symbols · {interval} · phase: {phase}
            {latestCached ? ' · cached result' : ''}
          </div>
        </div>
        <div className="flex gap-2">
          <select
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
            className="bg-surface-secondary rounded-md text-xs px-3 py-2"
          >
            {['5m', '15m', '30m', '1h', '4h', '1d'].map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
          <button
            onClick={triggerPreview}
            disabled={!ready || phase === 'preview' || phase === 'deep'}
            className="px-3 py-2 text-xs rounded-md bg-surface-secondary hover:bg-surface-tertiary disabled:opacity-40"
          >
            {t('action.run_preview')}
          </button>
          <button
            onClick={triggerDeep}
            disabled={!ready || phase === 'preview' || phase === 'deep'}
            className="px-3 py-2 text-xs rounded-md bg-accent-primary text-fg-inverse font-semibold disabled:opacity-40"
          >
            {t('action.run_deep')}
          </button>
        </div>
      </div>

      {/* Readiness checklist */}
      {!ready && (
        <div className="p-4 bg-surface-secondary rounded-lg text-sm space-y-2">
          <div>{current ? '✅' : '⬜'} Strategy: {current?.name ?? 'not set'}</div>
          <div>{symbols.length > 0 ? '✅' : '⬜'} Symbols: {symbols.length} selected</div>
          <div className="text-xs text-fg-muted">
            Load a strategy from the{' '}
            <button onClick={() => setTab('strategies')} className="text-accent-primary hover:underline">
              Strategies
            </button>{' '}
            tab.
          </div>
        </div>
      )}

      {/* Dimension toggle + metrics strip */}
      {metrics && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex bg-surface-secondary rounded-md p-1 text-xs">
              {(['all', 'long', 'short'] as Dimension[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDimension(d)}
                  className={
                    'px-3 py-1.5 rounded-sm ' +
                    (dimension === d
                      ? 'bg-surface-tertiary text-fg-primary'
                      : 'text-fg-secondary')
                  }
                >
                  {d.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-6 gap-3">
            <Metric label={t('metric.total_return')} value={fmt(metrics.total_return, '%')} positive={metrics.total_return >= 0} />
            <Metric label={t('metric.sharpe_ratio')} value={fmt(metrics.sharpe_ratio)} />
            <Metric label={t('metric.max_drawdown')} value={fmt(metrics.max_drawdown, '%')} negative />
            <Metric label={t('metric.win_rate')} value={fmt(metrics.win_rate, '%')} />
            <Metric label={t('metric.profit_factor')} value={fmt(metrics.profit_factor)} />
            <Metric label={t('metric.total_trades')} value={String(metrics.total_trades ?? 0)} />
          </div>
        </>
      )}

      {/* Equity + drawdown row */}
      {equity.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 bg-surface-secondary rounded-lg">
            <div className="font-heading font-semibold text-sm mb-2">Equity curve</div>
            <EquityCurve points={equity} height={220} />
          </div>
          <div className="p-4 bg-surface-secondary rounded-lg">
            <div className="font-heading font-semibold text-sm mb-2">Drawdown</div>
            <DrawdownCurve points={drawdown} height={220} />
          </div>
        </div>
      )}

      {/* Per-symbol ranking + monthly heatmap */}
      {Object.keys(perSymbol).length > 0 && (
        <div className="grid grid-cols-[1.2fr_1fr] gap-3">
          <div className="p-4 bg-surface-secondary rounded-lg">
            <div className="font-heading font-semibold text-sm mb-2">Per-symbol ranking</div>
            <SymbolRankingTable perSymbol={perSymbol} onSelect={setDrilldownSymbol} />
          </div>
          <div className="p-4 bg-surface-secondary rounded-lg">
            <div className="font-heading font-semibold text-sm mb-2">Monthly returns</div>
            <MonthlyHeatmap points={equity} />
          </div>
        </div>
      )}

      {/* K-line + trade list */}
      {trades.length > 0 && (
        <div className="grid grid-cols-[1.4fr_1fr] gap-3">
          <div className="p-4 bg-surface-secondary rounded-lg">
            <div className="font-heading font-semibold text-sm mb-2">Price & signals</div>
            <KlineChart
              candles={syntheticCandles(trades)}
              trades={trades}
              height={340}
            />
          </div>
          <div className="p-4 bg-surface-secondary rounded-lg">
            <div className="font-heading font-semibold text-sm mb-2">Trade journal</div>
            <TradeList trades={trades} />
          </div>
        </div>
      )}

      {(phase === 'preview' || phase === 'deep') && (
        <div className="text-xs text-fg-muted">
          Backtest running… {progress ? JSON.stringify(progress) : ''}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  const tone = positive
    ? 'text-accent-green'
    : negative
      ? 'text-accent-red'
      : 'text-fg-primary';
  return (
    <div className="bg-surface-secondary p-3 rounded-lg">
      <div className="text-[10px] text-fg-muted">{label}</div>
      <div className={'font-mono text-lg font-semibold ' + tone}>{value}</div>
    </div>
  );
}

function fmt(n: unknown, suffix = ''): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return (n >= 0 && suffix === '%' ? '+' : '') + n.toFixed(2) + suffix;
}

/** Build a synthetic candle series from trade timestamps and prices so the
 *  KlineChart renders something realistic even without real K-line data.
 *  Only used when no live K-line data is attached. */
function syntheticCandles(trades: Trade[]): KlineCandle[] {
  if (trades.length === 0) return [];
  const byTime = new Map<number, { open: number; high: number; low: number; close: number }>();
  for (const t of trades) {
    const entry = Math.floor(Date.parse(t.entry_time) / 1000);
    const exit = Math.floor(Date.parse(t.exit_time) / 1000);
    addCandle(byTime, entry, t.entry_price);
    addCandle(byTime, exit, t.exit_price);
  }
  // Add random midpoints
  const times = [...byTime.keys()].sort();
  const out: KlineCandle[] = times.map((time) => {
    const v = byTime.get(time)!;
    return { time, open: v.open, high: v.high, low: v.low, close: v.close };
  });
  // De-dup consecutive identical times.
  return out.filter((c, i, a) => i === 0 || c.time !== a[i - 1].time);
}

function addCandle(
  m: Map<number, { open: number; high: number; low: number; close: number }>,
  time: number,
  price: number,
) {
  const existing = m.get(time);
  if (!existing) {
    m.set(time, { open: price, high: price, low: price, close: price });
  } else {
    existing.high = Math.max(existing.high, price);
    existing.low = Math.min(existing.low, price);
    existing.close = price;
  }
}
