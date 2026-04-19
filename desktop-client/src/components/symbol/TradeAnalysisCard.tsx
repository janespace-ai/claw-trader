import { useEffect } from 'react';
import { useTradeAnalysisStore } from '@/stores/tradeAnalysisStore';

interface Props {
  tradeId: string | null;
  backtestTaskId: string | null;
  symbol: string;
}

/**
 * Renders `TradeExplainResult` as a structured card. Auto-triggers the
 * remote call when `tradeId` changes.
 */
export function TradeAnalysisCard({ tradeId, backtestTaskId, symbol }: Props) {
  const entry = useTradeAnalysisStore((s) => (tradeId ? s.byTradeId[tradeId] : undefined));
  const load = useTradeAnalysisStore((s) => s.loadForTrade);

  useEffect(() => {
    if (!tradeId || !backtestTaskId) return;
    void load({ backtest_task_id: backtestTaskId, symbol, trade_id: tradeId });
  }, [tradeId, backtestTaskId, symbol, load]);

  if (!tradeId) {
    return (
      <div className="text-xs text-fg-muted italic p-3">
        Select a trade in the journal to see the analysis.
      </div>
    );
  }
  if (!backtestTaskId) {
    return (
      <div className="text-xs text-fg-muted italic p-3">
        No backtest task context — Trade Analysis needs both the symbol and
        the backtest it came from.
      </div>
    );
  }
  if (!entry || entry.status === 'loading' || entry.status === 'idle') {
    return (
      <div className="p-3 space-y-2 animate-pulse">
        <div className="h-3 w-24 bg-surface-tertiary rounded" />
        <div className="h-3 w-full bg-surface-tertiary rounded" />
        <div className="h-3 w-11/12 bg-surface-tertiary rounded" />
      </div>
    );
  }
  if (entry.status === 'failed') {
    return (
      <div className="p-3 text-xs text-accent-red">
        {entry.error}
        <button
          onClick={() => void load({ backtest_task_id: backtestTaskId, symbol, trade_id: tradeId })}
          className="block mt-2 text-accent-primary hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const r = entry.result!;
  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="font-heading font-semibold text-sm">Trade {r.trade_id}</div>
      <p className="text-fg-secondary leading-snug">{r.narrative}</p>

      {r.entry_context && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase text-fg-muted">Entry context</div>
          {r.entry_context.regime && (
            <span className="inline-block px-2 py-0.5 rounded-full bg-surface-tertiary text-[10px]">
              {r.entry_context.regime}
            </span>
          )}
          {r.entry_context.indicators && Object.keys(r.entry_context.indicators).length > 0 && (
            <table className="w-full text-[11px] font-mono">
              <tbody>
                {Object.entries(r.entry_context.indicators).map(([k, v]) => (
                  <tr key={k} className="border-b border-border-subtle">
                    <td className="py-1 text-fg-muted">{k}</td>
                    <td className="py-1 text-right">{v.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {r.exit_context && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase text-fg-muted">Exit context</div>
          {r.exit_context.reason && (
            <span className="inline-block px-2 py-0.5 rounded-full bg-[color:var(--accent-primary-dim)] text-accent-primary text-[10px] font-semibold">
              {r.exit_context.reason}
            </span>
          )}
          {r.exit_context.indicators && Object.keys(r.exit_context.indicators).length > 0 && (
            <table className="w-full text-[11px] font-mono">
              <tbody>
                {Object.entries(r.exit_context.indicators).map(([k, v]) => (
                  <tr key={k} className="border-b border-border-subtle">
                    <td className="py-1 text-fg-muted">{k}</td>
                    <td className="py-1 text-right">{v.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
