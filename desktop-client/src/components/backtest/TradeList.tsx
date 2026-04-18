import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Trade } from '@/types/domain';

interface Props {
  trades: Trade[];
  onSelect?: (trade: Trade) => void;
  compact?: boolean;
}

type SideFilter = 'all' | 'long' | 'short';

export function TradeList({ trades, onSelect, compact }: Props) {
  const { t } = useTranslation();
  const [side, setSide] = useState<SideFilter>('all');
  const [symbol, setSymbol] = useState<string>('all');

  const symbols = useMemo(
    () => Array.from(new Set(trades.map((t) => t.symbol))).sort(),
    [trades],
  );

  const filtered = useMemo(() => {
    return trades.filter((x) => {
      if (side !== 'all' && x.side !== side) return false;
      if (symbol !== 'all' && x.symbol !== symbol) return false;
      return true;
    });
  }, [trades, side, symbol]);

  return (
    <div className="space-y-2">
      {/* Filter bar */}
      <div className="flex items-center gap-2 text-xs">
        <div className="flex bg-surface-tertiary rounded-md p-0.5">
          {(['all', 'long', 'short'] as SideFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={
                'px-2.5 py-1 rounded-sm ' +
                (side === s
                  ? s === 'long'
                    ? 'bg-[color:var(--accent-green-dim)] text-accent-green'
                    : s === 'short'
                      ? 'bg-[color:var(--accent-red-dim)] text-accent-red'
                      : 'bg-surface-primary text-fg-primary'
                  : 'text-fg-secondary')
              }
            >
              {s === 'all' ? t('strategy.tabs.all') : s.toUpperCase()}
            </button>
          ))}
        </div>
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="bg-surface-tertiary rounded-md px-2.5 py-1"
        >
          <option value="all">All symbols</option>
          {symbols.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-fg-muted ml-auto">{filtered.length} trades</span>
      </div>

      <div className="grid grid-cols-[30px_1fr_60px_2fr_80px_60px_80px] gap-2 text-[10px] text-fg-muted border-b border-border-subtle px-1 py-1.5 font-medium">
        <span>#</span>
        <span>Symbol</span>
        <span>Side</span>
        <span>Entry · Exit</span>
        <span className="text-right">Size</span>
        <span className="text-right">Hold</span>
        <span className="text-right">PnL</span>
      </div>

      <div className={'divide-y divide-border-subtle ' + (compact ? 'max-h-60 overflow-y-auto' : 'max-h-[480px] overflow-y-auto')}>
        {filtered.map((t, idx) => (
          <button
            key={idx}
            onClick={() => onSelect?.(t)}
            className="w-full grid grid-cols-[30px_1fr_60px_2fr_80px_60px_80px] gap-2 text-xs px-1 py-1.5 text-left hover:bg-surface-tertiary"
          >
            <span className="font-mono text-fg-muted">{idx + 1}</span>
            <span className="font-mono font-medium truncate">{t.symbol}</span>
            <span
              className={
                'font-mono text-[10px] px-1.5 py-0.5 rounded-sm w-fit self-center ' +
                (t.side === 'long'
                  ? 'bg-[color:var(--accent-green-dim)] text-accent-green'
                  : 'bg-[color:var(--accent-red-dim)] text-accent-red')
              }
            >
              {t.side.toUpperCase()}
            </span>
            <span className="font-mono text-fg-secondary truncate">
              {formatTs(t.entry_time)} → {formatTs(t.exit_time)}
            </span>
            <span className="font-mono text-right text-fg-secondary">
              {t.size} × {t.leverage}x
            </span>
            <span className="font-mono text-right text-fg-secondary">
              {t.duration_hours.toFixed(0)}h
            </span>
            <span
              className={
                'font-mono text-right font-semibold ' +
                (t.pnl >= 0 ? 'text-accent-green' : 'text-accent-red')
              }
            >
              {t.return_pct >= 0 ? '+' : ''}
              {t.return_pct.toFixed(2)}%
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="text-center text-fg-muted text-xs py-6">No trades match the filter.</div>
        )}
      </div>
    </div>
  );
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}
