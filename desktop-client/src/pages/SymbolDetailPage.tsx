import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KlineChart, type KlineCandle } from '@/components/charts/KlineChart';
import { EquityCurve } from '@/components/charts/EquityCurve';
import { DrawdownCurve, computeDrawdown } from '@/components/charts/DrawdownCurve';
import { RsiSubchart, computeRSI } from '@/components/charts/RsiSubchart';
import { TradeList } from '@/components/backtest/TradeList';
import type { BacktestResultRecord, Trade } from '@/types/domain';

interface Props {
  result: BacktestResultRecord;
  symbol: string;
  onBack: () => void;
}

/** Single-symbol drill-down: K-line + signals, RSI sub-panel,
 *  symbol equity/drawdown, symbol-scoped trade list.
 *  Clicking a trade row scrolls the chart to that timestamp. */
export function SymbolDetailPage({ result, symbol, onBack }: Props) {
  const { t } = useTranslation();

  const allTrades = (result.trades ?? []) as Trade[];
  const symbolTrades = useMemo(
    () => allTrades.filter((x) => x.symbol === symbol),
    [allTrades, symbol],
  );

  // Synthetic candles per symbol (same approach as BacktestPage when no real
  // K-line data is attached to the cached result).
  const candles = useMemo<KlineCandle[]>(
    () => syntheticCandlesForSymbol(symbolTrades),
    [symbolTrades],
  );

  const rsiPoints = useMemo(
    () => computeRSI(candles.map((c) => ({ time: c.time, close: c.close })), 14),
    [candles],
  );

  const symbolMetrics = (result.per_symbol_metrics as any)?.[symbol]?.all ?? null;

  const equity = useMemo(() => {
    // Project equity curve onto this symbol's trades by summing their pnl.
    let running = 10_000;
    const pts: Array<{ ts: string; equity: number }> = [];
    for (const t of symbolTrades.sort(
      (a, b) => Date.parse(a.exit_time) - Date.parse(b.exit_time),
    )) {
      running += t.pnl;
      pts.push({ ts: t.exit_time, equity: running });
    }
    return pts;
  }, [symbolTrades]);

  const drawdown = useMemo(() => computeDrawdown(equity), [equity]);

  // ---- Trade → chart scroll linkage (§12.6) ----
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!selectedTrade || !chartContainerRef.current) return;
    // Fire a custom event so the chart can react (scroll the price axis).
    const target = Math.floor(Date.parse(selectedTrade.entry_time) / 1000);
    window.dispatchEvent(
      new CustomEvent('claw:chart-scroll', { detail: { time: target } }),
    );
    chartContainerRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, [selectedTrade]);

  return (
    <div className="p-6 space-y-4">
      {/* Breadcrumb / back */}
      <div className="flex items-center gap-3 text-xs">
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-surface-secondary hover:bg-surface-tertiary"
        >
          ← {t('nav.back')}
        </button>
        <span className="text-fg-muted">/</span>
        <span className="text-fg-muted">Symbols</span>
        <span className="text-fg-muted">/</span>
        <span className="font-mono font-medium">{symbol}</span>
      </div>

      {/* Symbol header */}
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="font-mono text-2xl font-bold">{symbol}</h2>
          {symbolMetrics && (
            <span
              className={
                'font-mono text-sm font-semibold ' +
                (symbolMetrics.total_return >= 0 ? 'text-accent-green' : 'text-accent-red')
              }
            >
              {symbolMetrics.total_return >= 0 ? '+' : ''}
              {symbolMetrics.total_return.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {/* Per-symbol metrics strip */}
      {symbolMetrics && (
        <div className="grid grid-cols-6 gap-3">
          <Mini label={t('metric.total_return')} value={fmt(symbolMetrics.total_return, '%')} positive={symbolMetrics.total_return >= 0} />
          <Mini label={t('metric.sharpe_ratio')} value={fmt(symbolMetrics.sharpe_ratio)} />
          <Mini label={t('metric.max_drawdown')} value={fmt(symbolMetrics.max_drawdown, '%')} negative />
          <Mini label={t('metric.win_rate')} value={fmt(symbolMetrics.win_rate, '%')} />
          <Mini label={t('metric.profit_factor')} value={fmt(symbolMetrics.profit_factor)} />
          <Mini label={t('metric.total_trades')} value={String(symbolMetrics.total_trades ?? 0)} />
        </div>
      )}

      {/* Price & signals + RSI */}
      <div ref={chartContainerRef} className="p-4 bg-surface-secondary rounded-lg space-y-0">
        <div className="font-heading font-semibold text-sm mb-2">Price & signals</div>
        <KlineChart candles={candles} trades={symbolTrades} height={340} />
        <div className="mt-2 border-t border-border-subtle pt-2">
          <RsiSubchart points={rsiPoints} height={90} />
        </div>
      </div>

      {/* Equity + drawdown row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 bg-surface-secondary rounded-lg">
          <div className="font-heading font-semibold text-sm mb-2">Symbol equity</div>
          <EquityCurve points={equity} height={180} />
        </div>
        <div className="p-4 bg-surface-secondary rounded-lg">
          <div className="font-heading font-semibold text-sm mb-2">Drawdown</div>
          <DrawdownCurve points={drawdown} height={180} />
        </div>
      </div>

      {/* Trade list with linkage */}
      <div className="p-4 bg-surface-secondary rounded-lg">
        <div className="font-heading font-semibold text-sm mb-2">
          Trades on {symbol}
          <span className="text-fg-muted text-xs font-normal ml-2">
            click a row to jump to that point on the chart
          </span>
        </div>
        <TradeList trades={symbolTrades} onSelect={setSelectedTrade} />
      </div>
    </div>
  );
}

function Mini({
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
    <div className="bg-surface-tertiary p-3 rounded-md">
      <div className="text-[10px] text-fg-muted">{label}</div>
      <div className={'font-mono text-lg font-semibold ' + tone}>{value}</div>
    </div>
  );
}

function fmt(n: unknown, suffix = ''): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return (n >= 0 && suffix === '%' ? '+' : '') + n.toFixed(2) + suffix;
}

function syntheticCandlesForSymbol(trades: Trade[]): KlineCandle[] {
  if (trades.length === 0) return [];
  const bucket = new Map<number, { open: number; high: number; low: number; close: number }>();
  // Include entry/exit points and interpolate a price path between them.
  for (const t of trades) {
    const entry = Math.floor(Date.parse(t.entry_time) / 1000);
    const exit = Math.floor(Date.parse(t.exit_time) / 1000);
    merge(bucket, entry, t.entry_price);
    merge(bucket, exit, t.exit_price);
  }
  return Array.from(bucket.entries())
    .sort(([a], [b]) => a - b)
    .map(([time, v]) => ({ time, open: v.open, high: v.high, low: v.low, close: v.close }));
}

function merge(
  m: Map<number, { open: number; high: number; low: number; close: number }>,
  time: number,
  price: number,
) {
  const cur = m.get(time);
  if (!cur) {
    m.set(time, { open: price, high: price, low: price, close: price });
  } else {
    cur.high = Math.max(cur.high, price);
    cur.low = Math.min(cur.low, price);
    cur.close = price;
  }
}
