import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface PerSymbolRow {
  symbol: string;
  pnlPct: number | null;
  sharpe: number | null;
  winRate: number | null;
  tradeCount: number | null;
}

export type OutcomeFilter = 'all' | 'profit' | 'loss' | 'flat';

type SortKey = 'symbol' | 'pnlPct' | 'sharpe' | 'winRate' | 'tradeCount';

interface Props {
  rows: PerSymbolRow[];
  filter: OutcomeFilter;
  onFilterChange: (next: OutcomeFilter) => void;
  /** Click a row → focus chart on that symbol (drill-down). */
  onFocusSymbol?: (symbol: string) => void;
}

/**
 * Sortable per-symbol breakdown table that sits below the aggregate
 * metrics tiles in BacktestResultPane.  Includes an outcome filter
 * chip set (全部 / 盈利 / 亏损 / 持平) and clickable rows for chart
 * drill-down.
 *
 * Defaults: sort by pnlPct desc.
 *
 * Mirrors Pencil reference frame `qUxgb`'s table sub-layout.
 */
export function PerSymbolTable({ rows, filter, onFilterChange, onFocusSymbol }: Props) {
  const { t } = useTranslation();

  const [sortKey, setSortKey] = useState<SortKey>('pnlPct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const counts = useMemo(() => bucketCounts(rows), [rows]);
  const filtered = useMemo(() => applyFilter(rows, filter), [rows, filter]);
  const sorted = useMemo(
    () => sortRows(filtered, sortKey, sortDir),
    [filtered, sortKey, sortDir],
  );

  const onClickHeader = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(k);
      setSortDir(k === 'symbol' ? 'asc' : 'desc');
    }
  };

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-secondary overflow-hidden">
      {/* Top row: title + outcome filter chips */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle gap-3 flex-wrap">
        <div className="text-[12px] font-semibold text-fg-primary">
          {t('result.table.title', { defaultValue: '按币种' })} ({rows.length})
        </div>
        <div className="flex items-center gap-1.5" role="tablist">
          {([
            { k: 'all', label: t('result.filter.all', { defaultValue: '全部' }) },
            {
              k: 'profit',
              label: t('result.filter.profit', { defaultValue: '盈利' }),
              count: counts.profit,
            },
            {
              k: 'loss',
              label: t('result.filter.loss', { defaultValue: '亏损' }),
              count: counts.loss,
            },
            {
              k: 'flat',
              label: t('result.filter.flat', { defaultValue: '持平' }),
              count: counts.flat,
            },
          ] as Array<{ k: OutcomeFilter; label: string; count?: number }>).map((c) => {
            const isActive = c.k === filter;
            return (
              <button
                key={c.k}
                role="tab"
                aria-selected={isActive}
                onClick={() => onFilterChange(c.k)}
                className={
                  'h-6 px-2.5 rounded-full text-[10px] font-medium inline-flex items-center gap-1 transition-colors ' +
                  (isActive
                    ? 'bg-surface-tertiary text-fg-primary font-semibold'
                    : 'border border-border-subtle text-fg-secondary hover:text-fg-primary hover:bg-surface-tertiary/40')
                }
              >
                <span>{c.label}</span>
                {c.count != null && c.count > 0 && (
                  <span className="text-fg-muted/80 font-mono">({c.count})</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Header row */}
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_0.8fr] gap-2 px-4 h-9 items-center border-b border-border-subtle bg-surface-secondary/60 text-[10px] uppercase tracking-wide font-semibold text-fg-muted">
        <Header keyName="symbol" current={sortKey} dir={sortDir} onClick={onClickHeader}>
          {t('result.col.symbol', { defaultValue: '币种' })}
        </Header>
        <Header
          keyName="pnlPct"
          current={sortKey}
          dir={sortDir}
          onClick={onClickHeader}
          align="right"
        >
          PnL %
        </Header>
        <Header
          keyName="sharpe"
          current={sortKey}
          dir={sortDir}
          onClick={onClickHeader}
          align="right"
        >
          Sharpe
        </Header>
        <Header
          keyName="winRate"
          current={sortKey}
          dir={sortDir}
          onClick={onClickHeader}
          align="right"
        >
          {t('result.col.winrate', { defaultValue: '胜率' })}
        </Header>
        <Header
          keyName="tradeCount"
          current={sortKey}
          dir={sortDir}
          onClick={onClickHeader}
          align="right"
        >
          {t('result.col.trades', { defaultValue: '交易' })}
        </Header>
      </div>

      {/* Body rows */}
      {sorted.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12px] text-fg-muted italic">
          {t('result.table.empty', {
            defaultValue: '当前筛选下没有匹配的币种。',
          })}
        </div>
      ) : (
        <div>
          {sorted.map((r) => (
            <button
              key={r.symbol}
              onClick={() => onFocusSymbol?.(r.symbol)}
              className="w-full text-left grid grid-cols-[2fr_1fr_1fr_1fr_0.8fr] gap-2 px-4 h-9 items-center border-b border-border-subtle/60 hover:bg-surface-tertiary/40 transition-colors group"
            >
              <span className="font-mono text-[11px] font-semibold text-fg-primary group-hover:text-accent-primary">
                {r.symbol}
              </span>
              <Cell value={fmtPercent(r.pnlPct)} colorByValue={r.pnlPct} />
              <Cell value={fmtNum(r.sharpe, 2)} />
              <Cell value={fmtPercent(r.winRate)} />
              <Cell value={fmtNum(r.tradeCount, 0)} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Header({
  keyName,
  current,
  dir,
  onClick,
  align,
  children,
}: {
  keyName: SortKey;
  current: SortKey;
  dir: 'asc' | 'desc';
  onClick: (k: SortKey) => void;
  align?: 'right';
  children: React.ReactNode;
}) {
  const active = keyName === current;
  return (
    <button
      type="button"
      onClick={() => onClick(keyName)}
      className={
        'inline-flex items-center gap-1 ' +
        (align === 'right' ? 'justify-end ' : '') +
        (active
          ? 'text-fg-primary font-bold'
          : 'hover:text-fg-secondary')
      }
    >
      {children}
      {active && <span aria-hidden>{dir === 'asc' ? '▲' : '▼'}</span>}
    </button>
  );
}

function Cell({
  value,
  colorByValue,
}: {
  value: string;
  colorByValue?: number | null;
}) {
  let cls = 'font-mono text-[11px] tabular-nums text-right text-fg-secondary';
  if (typeof colorByValue === 'number') {
    if (colorByValue > 0) cls += ' !text-accent-green font-semibold';
    else if (colorByValue < 0) cls += ' !text-accent-red font-semibold';
  }
  return <span className={cls}>{value}</span>;
}

function fmtPercent(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
}

function fmtNum(v: number | null, digits: number): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

function bucketCounts(rows: PerSymbolRow[]): { profit: number; loss: number; flat: number } {
  let profit = 0;
  let loss = 0;
  let flat = 0;
  for (const r of rows) {
    if (r.pnlPct == null || !Number.isFinite(r.pnlPct)) flat++;
    else if (r.pnlPct > 0) profit++;
    else if (r.pnlPct < 0) loss++;
    else flat++;
  }
  return { profit, loss, flat };
}

function applyFilter(rows: PerSymbolRow[], f: OutcomeFilter): PerSymbolRow[] {
  if (f === 'all') return rows;
  return rows.filter((r) => {
    if (r.pnlPct == null || !Number.isFinite(r.pnlPct)) {
      return f === 'flat';
    }
    if (f === 'profit') return r.pnlPct > 0;
    if (f === 'loss') return r.pnlPct < 0;
    return r.pnlPct === 0;
  });
}

function sortRows(rows: PerSymbolRow[], key: SortKey, dir: 'asc' | 'desc'): PerSymbolRow[] {
  const mult = dir === 'asc' ? 1 : -1;
  const out = [...rows];
  out.sort((a, b) => {
    if (key === 'symbol') return a.symbol.localeCompare(b.symbol) * mult;
    const av = a[key];
    const bv = b[key];
    // null / NaN sinks to bottom regardless of direction
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * mult;
  });
  return out;
}
