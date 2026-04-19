import type { components } from '@/types/api';

type Trade = components['schemas']['Trade'];

interface Props {
  trades: Trade[];
  /** Cap (for non-virtualized rendering). Defaults to 200; upgrade to
   *  react-window if the preview run routinely exceeds this. */
  cap?: number;
  selectedSymbol?: string;
  onRowClick?: (trade: Trade) => void;
}

function formatTs(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

function pnlClass(pct: number | null | undefined): string {
  if (pct == null) return 'text-fg-muted';
  return pct >= 0 ? 'text-accent-green' : 'text-accent-red';
}

/** Non-virtualized trades table; capped at `cap` rows. */
export function TradesTab({ trades, cap = 200, selectedSymbol, onRowClick }: Props) {
  const rows = trades.slice(0, cap);
  return (
    <div className="bg-surface-secondary rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead className="text-fg-muted text-[10px] uppercase bg-surface-tertiary">
          <tr>
            <th className="text-left py-2 px-3 font-medium">Symbol</th>
            <th className="text-left py-2 px-3 font-medium">Side</th>
            <th className="text-left py-2 px-3 font-medium">Entry</th>
            <th className="text-right py-2 px-3 font-medium">Entry px</th>
            <th className="text-left py-2 px-3 font-medium">Exit</th>
            <th className="text-right py-2 px-3 font-medium">Exit px</th>
            <th className="text-right py-2 px-3 font-medium">PnL %</th>
            <th className="text-right py-2 px-3 font-medium">Dur (h)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr
              key={t.id}
              onClick={() => onRowClick?.(t)}
              className={
                'border-t border-border-subtle cursor-pointer ' +
                (selectedSymbol === t.symbol
                  ? 'bg-surface-tertiary'
                  : 'hover:bg-surface-tertiary')
              }
            >
              <td className="py-2 px-3 font-medium">{t.symbol}</td>
              <td className="py-2 px-3">
                <span
                  className={
                    'px-1.5 py-0.5 rounded text-[10px] font-semibold ' +
                    (t.side === 'long'
                      ? 'bg-[color:var(--accent-green-dim)] text-accent-green'
                      : 'bg-[color:var(--accent-red-dim)] text-accent-red')
                  }
                >
                  {t.side}
                </span>
              </td>
              <td className="py-2 px-3 text-fg-secondary">{formatTs(t.entry_ts)}</td>
              <td className="py-2 px-3 text-right font-mono">{t.entry_price.toFixed(4)}</td>
              <td className="py-2 px-3 text-fg-secondary">
                {t.exit_ts != null ? formatTs(t.exit_ts) : '—'}
              </td>
              <td className="py-2 px-3 text-right font-mono">
                {t.exit_price != null ? t.exit_price.toFixed(4) : '—'}
              </td>
              <td className={'py-2 px-3 text-right font-mono ' + pnlClass(t.pnl_pct)}>
                {t.pnl_pct != null ? (t.pnl_pct * 100).toFixed(2) + '%' : '—'}
              </td>
              <td className="py-2 px-3 text-right text-fg-secondary">
                {t.duration_hours != null ? t.duration_hours.toFixed(1) : '—'}
              </td>
            </tr>
          ))}
          {trades.length === 0 && (
            <tr>
              <td colSpan={8} className="py-6 text-center text-fg-muted">
                No trades in this preview.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {trades.length > cap && (
        <div className="text-[10px] text-fg-muted px-3 py-2 border-t border-border-subtle">
          Showing {cap} of {trades.length}. Upgrade to virtualized view to see the rest.
        </div>
      )}
    </div>
  );
}
