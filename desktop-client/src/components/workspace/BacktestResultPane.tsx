import { useTranslation } from 'react-i18next';
import { ClawChart, MetricsGrid, type Metric } from '@/components/primitives';
import type { components } from '@/types/api';
import { PerSymbolTable, type PerSymbolRow, type OutcomeFilter } from './PerSymbolTable';
import { useState } from 'react';

type BacktestResultExtended = components['schemas']['BacktestResultExtended'];

interface Props {
  result: BacktestResultExtended;
  /** True when draft has changed since this backtest finished — banner
   *  warns that the cached result may be out of date. */
  stale: boolean;
  onRerun?: () => void;
  /** Click a row in the per-symbol drill-down. */
  onFocusSymbol?: (symbol: string) => void;
}

/**
 * Multi-symbol backtest result surface — the new "结果" tab content
 * inside the unified-strategy-workspace.  Replaces the Group 4 raw
 * JSON dump.
 *
 * Top: 5 aggregate metric tiles + 1 combined equity curve.
 * Bottom: PerSymbolTable (sortable, outcome-filterable, click → drill).
 *
 * Layout mirrors Pencil reference frame `qUxgb` (S3 state variant).
 */
export function BacktestResultPane({ result, stale, onRerun, onFocusSymbol }: Props) {
  const { t } = useTranslation();

  const summary = result.summary;
  const m = summary.metrics ?? {};
  const equityCurve = (summary.equity_curve ?? []).map((p) => ({
    ts: p.ts,
    value: p.value,
  }));

  const fmtPercent = (v: number | null | undefined) =>
    typeof v === 'number' ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%` : null;

  const aggregateTiles: Metric[] = [
    {
      label: t('result.metric.pnl', { defaultValue: '总 PnL' }),
      value: fmtPercent(m.total_return),
    },
    {
      label: t('result.metric.sharpe', { defaultValue: 'Sharpe' }),
      value: typeof m.sharpe === 'number' ? m.sharpe : null,
    },
    {
      label: t('result.metric.maxdd', { defaultValue: '最大回撤' }),
      value: fmtPercent(m.max_drawdown),
    },
    {
      label: t('result.metric.winrate', { defaultValue: '胜率' }),
      value: fmtPercent(m.win_rate),
    },
    {
      label: t('result.metric.trades', { defaultValue: '交易数' }),
      value: typeof m.total_trades === 'number' ? m.total_trades : null,
    },
  ];

  const rows = perSymbolRows(result);

  // Local outcome-filter state.  Aggregate metrics + equity curve are
  // independent of this — only the table rows filter.
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Stale banner */}
      {stale && (
        <div className="rounded-lg border border-accent-yellow/40 bg-[color:var(--accent-yellow-dim,rgba(245,158,11,0.13))] px-4 py-2.5 flex items-center gap-3">
          <span aria-hidden className="text-accent-yellow">
            ⚠
          </span>
          <span className="flex-1 text-[12px] text-fg-primary">
            {t('result.stale', {
              defaultValue:
                '结果可能已过时——草稿在上次回测之后又改了。',
            })}
          </span>
          <button
            onClick={onRerun}
            className="h-7 px-3 rounded-md text-[11px] font-semibold bg-accent-yellow text-fg-inverse hover:opacity-90"
          >
            {t('result.rerun', { defaultValue: '重新跑' })}
          </button>
        </div>
      )}

      {/* Aggregate metric tiles */}
      <MetricsGrid metrics={aggregateTiles} minColWidth={150} />

      {/* Combined equity curve */}
      {equityCurve.length > 0 && (
        <div className="rounded-lg border border-border-subtle bg-surface-secondary p-4">
          <div className="text-[11px] font-semibold text-fg-muted mb-2">
            {t('result.equity_title', { defaultValue: '权益曲线（合计）' })}
          </div>
          <ClawChart.Equity data={equityCurve} height={220} />
        </div>
      )}

      {/* Per-symbol drill-down */}
      <PerSymbolTable
        rows={rows}
        filter={outcomeFilter}
        onFilterChange={setOutcomeFilter}
        onFocusSymbol={onFocusSymbol}
      />
    </div>
  );
}

function perSymbolRows(result: BacktestResultExtended): PerSymbolRow[] {
  const out: PerSymbolRow[] = [];
  const map = result.per_symbol ?? {};
  for (const [sym, sr] of Object.entries(map)) {
    const m = sr.metrics ?? {};
    out.push({
      symbol: sym,
      pnlPct: typeof m.total_return === 'number' ? m.total_return : null,
      sharpe: typeof m.sharpe === 'number' ? m.sharpe : null,
      winRate: typeof m.win_rate === 'number' ? m.win_rate : null,
      tradeCount: typeof m.total_trades === 'number' ? m.total_trades : null,
    });
  }
  return out;
}
