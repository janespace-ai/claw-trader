import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClawChart } from '@/components/primitives';

export interface SymbolCell {
  symbol: string;
  /** Sequence of (ts, value) equity points; simplest input. */
  equity?: { ts: number; value: number }[];
  /** Total return as a fraction (0.12 = +12%). */
  returnPct?: number;
  /** Total trades this symbol produced. */
  trades?: number;
}

interface Props {
  cells: SymbolCell[];
  focusedSymbol?: string | null;
  onSingleClick?: (symbol: string) => void;
  onDoubleClick?: (symbol: string) => void;
}

type Sort = 'symbol' | 'return-desc' | 'return-asc' | 'trades-desc';

function returnOf(c: SymbolCell): number {
  return c.returnPct ?? 0;
}

function gridDims(n: number): { cols: number; rows: number } {
  if (n <= 0) return { cols: 1, rows: 1 };
  if (n <= 4) return { cols: 2, rows: 2 };
  if (n <= 9) return { cols: 3, rows: 3 };
  if (n <= 16) return { cols: 4, rows: 4 };
  return { cols: 5, rows: Math.ceil(n / 5) };
}

/** Responsive 3×3-ish grid of per-symbol equity minis. */
export function CrossSymbolGrid({
  cells,
  focusedSymbol,
  onSingleClick,
  onDoubleClick,
}: Props) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<Sort>('return-desc');

  const sorted = useMemo(() => {
    const copy = [...cells];
    switch (sort) {
      case 'symbol':
        copy.sort((a, b) => a.symbol.localeCompare(b.symbol));
        break;
      case 'return-desc':
        copy.sort((a, b) => returnOf(b) - returnOf(a));
        break;
      case 'return-asc':
        copy.sort((a, b) => returnOf(a) - returnOf(b));
        break;
      case 'trades-desc':
        copy.sort((a, b) => (b.trades ?? 0) - (a.trades ?? 0));
        break;
    }
    return copy;
  }, [cells, sort]);

  const { cols } = gridDims(sorted.length);

  if (sorted.length === 0) {
    return (
      <div className="p-8 text-center text-fg-muted text-sm border border-dashed border-border-subtle rounded-lg">
        {t('grid.empty')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase text-fg-muted">
          {t('grid.symbols_count', { n: sorted.length })}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="bg-surface-tertiary text-xs px-2 py-1 rounded-md"
          aria-label={t('grid.sort_aria')}
        >
          <option value="return-desc">{t('grid.sort.return_desc')}</option>
          <option value="return-asc">{t('grid.sort.return_asc')}</option>
          <option value="symbol">{t('grid.sort.symbol')}</option>
          <option value="trades-desc">{t('grid.sort.trades_desc')}</option>
        </select>
      </div>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {sorted.map((c) => {
          const r = c.returnPct ?? 0;
          const tone =
            r > 0
              ? 'text-accent-green'
              : r < 0
                ? 'text-accent-red'
                : 'text-fg-muted';
          return (
            <div
              key={c.symbol}
              onClick={() => onSingleClick?.(c.symbol)}
              onDoubleClick={() => onDoubleClick?.(c.symbol)}
              className={
                'bg-surface-secondary rounded-lg p-3 cursor-pointer border transition-colors ' +
                (focusedSymbol === c.symbol
                  ? 'border-accent-primary'
                  : 'border-border-subtle hover:border-accent-primary-dim')
              }
            >
              <div className="flex items-center justify-between">
                <span className="font-heading font-semibold text-xs">{c.symbol}</span>
                <span className={'font-mono text-[11px] ' + tone}>
                  {r > 0 ? '+' : ''}
                  {(r * 100).toFixed(2)}%
                </span>
              </div>
              <div className="h-16 mt-2">
                {c.equity && c.equity.length > 0 ? (
                  <ClawChart.Mini data={c.equity} height={64} />
                ) : (
                  <div className="h-full grid place-items-center text-[10px] text-fg-muted border border-dashed border-border-subtle rounded">
                    {t('grid.cell.no_equity')}
                  </div>
                )}
              </div>
              {c.trades != null && (
                <div className="text-[10px] text-fg-muted mt-1">
                  {t('grid.cell.trades', { n: c.trades })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
