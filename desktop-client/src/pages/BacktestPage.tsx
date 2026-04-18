import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStrategyStore } from '@/stores/strategyStore';
import { useCoinListStore } from '@/stores/coinListStore';
import { useBacktestStore } from '@/stores/backtestStore';
import { KlineChart } from '@/components/charts/KlineChart';
import { EquityCurve } from '@/components/charts/EquityCurve';

const DEFAULT_INTERVAL = '1h';

export function BacktestPage() {
  const { t } = useTranslation();
  const current = useStrategyStore((s) => s.current);
  const symbols = useCoinListStore((s) => s.symbols);
  const phase = useBacktestStore((s) => s.phase);
  const progress = useBacktestStore((s) => s.progress);
  const result = useBacktestStore((s) => s.result);
  const runPreview = useBacktestStore((s) => s.runPreview);
  const runDeep = useBacktestStore((s) => s.runDeep);

  const ready = !!current && symbols.length > 0;
  const [interval, setInterval] = useState(DEFAULT_INTERVAL);

  useEffect(() => {
    // Noop - load recent result for current strategy into view.
  }, [current]);

  const triggerPreview = () => {
    if (!current) return;
    const toDate = new Date();
    const fromDate = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    void runPreview(current.id, current.code, {
      symbols,
      interval,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      initial_capital: 10_000,
      commission: 0.0006,
      slippage: 0.0001,
      fill_mode: 'close',
    });
  };

  const triggerDeep = () => {
    if (!current) return;
    const toDate = new Date();
    const fromDate = new Date(Date.now() - 180 * 24 * 3600 * 1000);
    void runDeep(current.id, current.code, {
      symbols,
      interval,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      initial_capital: 10_000,
      commission: 0.0006,
      slippage: 0.0001,
      fill_mode: 'close',
    });
  };

  const summary = result?.result?.metrics?.all ?? null;
  const equity = result?.result?.equity_curve ?? [];

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
          <div>
            {current ? '✅' : '⬜'} Strategy: {current?.name ?? 'not set'}
          </div>
          <div>
            {symbols.length > 0 ? '✅' : '⬜'} Symbols: {symbols.length} selected
          </div>
        </div>
      )}

      {/* Metrics strip */}
      {summary && (
        <div className="grid grid-cols-6 gap-3">
          <Metric label={t('metric.total_return')} value={fmt(summary.total_return, '%')} positive={summary.total_return >= 0} />
          <Metric label={t('metric.sharpe_ratio')} value={fmt(summary.sharpe_ratio)} />
          <Metric label={t('metric.max_drawdown')} value={fmt(summary.max_drawdown, '%')} negative />
          <Metric label={t('metric.win_rate')} value={fmt(summary.win_rate, '%')} />
          <Metric label={t('metric.profit_factor')} value={fmt(summary.profit_factor)} />
          <Metric label={t('metric.total_trades')} value={String(summary.total_trades ?? 0)} />
        </div>
      )}

      {/* Equity curve */}
      {equity.length > 0 && (
        <div className="p-4 bg-surface-secondary rounded-lg">
          <div className="font-heading font-semibold text-sm mb-2">Equity</div>
          <EquityCurve points={equity} height={200} />
        </div>
      )}

      {/* Empty K-line placeholder for now (real candles would come from remote data API) */}
      {result && (
        <div className="p-4 bg-surface-secondary rounded-lg">
          <div className="font-heading font-semibold text-sm mb-2">Price & signals</div>
          <KlineChart candles={[]} trades={result?.result?.trades ?? []} height={340} />
        </div>
      )}

      {phase === 'preview' || phase === 'deep' ? (
        <div className="text-xs text-fg-muted">
          Backtest running… {progress ? JSON.stringify(progress) : ''}
        </div>
      ) : null}
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
