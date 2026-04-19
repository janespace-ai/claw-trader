import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const rows = trades.slice(0, cap);
  return (
    <div className="bg-surface-secondary rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead className="text-fg-muted text-[10px] uppercase bg-surface-tertiary">
          <tr>
            <th className="text-left py-2 px-3 font-medium">{t('trades.col.symbol')}</th>
            <th className="text-left py-2 px-3 font-medium">{t('trades.col.side')}</th>
            <th className="text-left py-2 px-3 font-medium">{t('trades.col.entry')}</th>
            <th className="text-right py-2 px-3 font-medium">{t('trades.col.entry_px')}</th>
            <th className="text-left py-2 px-3 font-medium">{t('trades.col.exit')}</th>
            <th className="text-right py-2 px-3 font-medium">{t('trades.col.exit_px')}</th>
            <th className="text-right py-2 px-3 font-medium">{t('trades.col.pnl_pct')}</th>
            <th className="text-right py-2 px-3 font-medium">{t('trades.col.duration_h')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((tr) => (
            <tr
              key={tr.id}
              onClick={() => onRowClick?.(tr)}
              className={
                'border-t border-border-subtle cursor-pointer ' +
                (selectedSymbol === tr.symbol
                  ? 'bg-surface-tertiary'
                  : 'hover:bg-surface-tertiary')
              }
            >
              <td className="py-2 px-3 font-medium">{tr.symbol}</td>
              <td className="py-2 px-3">
                <span
                  className={
                    'px-1.5 py-0.5 rounded text-[10px] font-semibold ' +
                    (tr.side === 'long'
                      ? 'bg-[color:var(--accent-green-dim)] text-accent-green'
                      : 'bg-[color:var(--accent-red-dim)] text-accent-red')
                  }
                >
                  {tr.side}
                </span>
              </td>
              <td className="py-2 px-3 text-fg-secondary">{formatTs(tr.entry_ts)}</td>
              <td className="py-2 px-3 text-right font-mono">{tr.entry_price.toFixed(4)}</td>
              <td className="py-2 px-3 text-fg-secondary">
                {tr.exit_ts != null ? formatTs(tr.exit_ts) : '—'}
              </td>
              <td className="py-2 px-3 text-right font-mono">
                {tr.exit_price != null ? tr.exit_price.toFixed(4) : '—'}
              </td>
              <td className={'py-2 px-3 text-right font-mono ' + pnlClass(tr.pnl_pct)}>
                {tr.pnl_pct != null ? (tr.pnl_pct * 100).toFixed(2) + '%' : '—'}
              </td>
              <td className="py-2 px-3 text-right text-fg-secondary">
                {tr.duration_hours != null ? tr.duration_hours.toFixed(1) : '—'}
              </td>
            </tr>
          ))}
          {trades.length === 0 && (
            <tr>
              <td colSpan={8} className="py-6 text-center text-fg-muted">
                {t('trades.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {trades.length > cap && (
        <div className="text-[10px] text-fg-muted px-3 py-2 border-t border-border-subtle">
          {t('trades.truncated', { cap, total: trades.length })}
        </div>
      )}
    </div>
  );
}
