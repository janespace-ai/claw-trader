import { Fragment, useMemo, useState } from 'react';

export interface MonthlyReturn {
  /** YYYY-MM (e.g. "2024-03"). */
  month: string;
  /** Return as a fraction (0.045 = +4.5%). */
  value: number;
  /** Optional: trade count for tooltips. */
  trades?: number;
}

interface Props {
  data: MonthlyReturn[];
  /** Optional explicit color-scale min/max. Defaults to +/- 10%. */
  domain?: { min: number; max: number };
  className?: string;
}

interface Cell {
  year: number;
  month: number;
  value: number | null;
  trades?: number;
}

function colorFor(value: number | null, domain: { min: number; max: number }): string {
  if (value == null) return 'var(--surface-tertiary, #222)';
  if (value === 0) return 'var(--surface-secondary, #333)';
  const norm = Math.max(-1, Math.min(1, value / Math.max(Math.abs(domain.min), domain.max)));
  if (norm >= 0) {
    const alpha = Math.max(0.1, Math.min(1, norm));
    return `color-mix(in srgb, var(--accent-green) ${Math.round(alpha * 100)}%, transparent)`;
  }
  const alpha = Math.max(0.1, Math.min(1, -norm));
  return `color-mix(in srgb, var(--accent-red) ${Math.round(alpha * 100)}%, transparent)`;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * 12-column × N-row heatmap of monthly returns. Rows are years (newest
 * on top); columns are Jan..Dec. Missing months render as a blank cell.
 */
export function MonthlyHeatmap({ data, domain = { min: -0.1, max: 0.1 }, className }: Props) {
  const [hover, setHover] = useState<Cell | null>(null);

  const byYear = useMemo(() => {
    const map = new Map<number, Cell[]>();
    for (const d of data) {
      const [y, m] = d.month.split('-').map(Number);
      if (!Number.isFinite(y) || !Number.isFinite(m)) continue;
      const row = map.get(y) ?? Array.from({ length: 12 }, (_, i) => ({
        year: y,
        month: i + 1,
        value: null as number | null,
        trades: undefined as number | undefined,
      }));
      row[m - 1] = { year: y, month: m, value: d.value, trades: d.trades };
      map.set(y, row);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b - a);
  }, [data]);

  if (byYear.length === 0) {
    return (
      <div className={'text-xs text-fg-muted italic p-4 text-center ' + (className ?? '')}>
        No monthly returns data yet.
      </div>
    );
  }

  return (
    <div className={'relative ' + (className ?? '')}>
      <div className="grid" style={{ gridTemplateColumns: 'auto repeat(12, minmax(0, 1fr))' }}>
        <div />
        {MONTH_LABELS.map((m) => (
          <div key={m} className="text-[10px] text-fg-muted text-center py-1">{m}</div>
        ))}
        {byYear.map(([year, cells]) => (
          <Fragment key={`y-${year}`}>
            <div className="text-[10px] text-fg-muted pr-2 flex items-center justify-end">
              {year}
            </div>
            {cells.map((c) => (
              <div
                key={`${year}-${c.month}`}
                className="h-8 m-0.5 rounded-sm cursor-default"
                style={{ backgroundColor: colorFor(c.value, domain) }}
                onMouseEnter={() => setHover(c)}
                onMouseLeave={() => setHover(null)}
                role="gridcell"
                aria-label={
                  c.value == null
                    ? `${year}-${String(c.month).padStart(2, '0')}: no data`
                    : `${year}-${String(c.month).padStart(2, '0')}: ${(c.value * 100).toFixed(2)}%`
                }
              />
            ))}
          </Fragment>
        ))}
      </div>
      {hover && hover.value != null && (
        <div className="absolute top-0 right-0 bg-surface-primary border border-border-subtle text-xs px-2 py-1 rounded-md pointer-events-none">
          {hover.year}-{String(hover.month).padStart(2, '0')}: {(hover.value * 100).toFixed(2)}%
          {hover.trades != null && ` · ${hover.trades} trades`}
        </div>
      )}
    </div>
  );
}
