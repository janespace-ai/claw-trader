import { useMemo } from 'react';

interface EquityPoint {
  ts: string;
  equity: number;
}

interface Props {
  points: EquityPoint[];
  rowsByRow?: number; // default 1 row (portfolio). Future: per-symbol rows.
}

interface Cell {
  year: number;
  month: number; // 1-12
  return: number; // percent
}

/** Derive monthly returns from an equity curve by sampling last equity per month. */
function toMonthly(points: EquityPoint[]): Cell[] {
  if (points.length === 0) return [];
  const byKey = new Map<string, number>();
  for (const p of points) {
    const d = new Date(p.ts);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
    byKey.set(key, p.equity);
  }
  const entries = Array.from(byKey.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  const out: Cell[] = [];
  for (let i = 1; i < entries.length; i++) {
    const [key, eq] = entries[i];
    const [prevKey, prevEq] = entries[i - 1];
    void prevKey;
    const [y, m] = key.split('-').map(Number);
    const ret = prevEq > 0 ? ((eq - prevEq) / prevEq) * 100 : 0;
    out.push({ year: y, month: m, return: ret });
  }
  return out;
}

/** Map a return value to a tint. Green for positive, red for negative. */
function tint(ret: number): string {
  if (ret === 0 || Number.isNaN(ret)) return 'var(--surface-tertiary)';
  const magnitude = Math.min(1, Math.abs(ret) / 15); // clamp at ±15%
  const alpha = Math.round(0x22 + magnitude * 0xaa)
    .toString(16)
    .padStart(2, '0');
  const base = ret > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
  // Inject alpha via color-mix for browser support; fallback opacity if unavailable.
  return `color-mix(in srgb, ${base} ${Math.round(20 + magnitude * 70)}%, transparent)`;
}

/** Monthly-returns heatmap. One row = portfolio; columns = calendar months. */
export function MonthlyHeatmap({ points }: Props) {
  const cells = useMemo(() => toMonthly(points), [points]);

  if (cells.length === 0) {
    return <div className="text-xs text-fg-muted">No monthly data yet.</div>;
  }

  // Group by year.
  const years = Array.from(new Set(cells.map((c) => c.year))).sort();
  const byYearMonth = new Map<string, number>();
  cells.forEach((c) => byYearMonth.set(`${c.year}-${c.month}`, c.return));

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="space-y-1 text-[10px]">
      <div className="grid grid-cols-[40px_repeat(12,1fr)] gap-1 text-fg-muted">
        <div />
        {months.map((m) => (
          <div key={m} className="text-center">{m}</div>
        ))}
      </div>
      {years.map((y) => (
        <div key={y} className="grid grid-cols-[40px_repeat(12,1fr)] gap-1 items-center">
          <div className="text-fg-muted font-mono">{y}</div>
          {months.map((_, idx) => {
            const key = `${y}-${idx + 1}`;
            const v = byYearMonth.get(key);
            return (
              <div
                key={key}
                title={v === undefined ? '' : `${months[idx]} ${y}: ${v.toFixed(2)}%`}
                className="h-6 rounded flex items-center justify-center font-mono text-[9px]"
                style={{
                  background: v === undefined ? 'var(--surface-tertiary)' : tint(v),
                  color: v === undefined ? 'var(--fg-muted)' : 'var(--fg-primary)',
                }}
              >
                {v === undefined ? '' : v > 0 ? '+' + v.toFixed(1) : v.toFixed(1)}
              </div>
            );
          })}
        </div>
      ))}
      <div className="flex items-center gap-2 pt-2 text-fg-muted">
        <span>Loss</span>
        <div
          className="flex-1 h-2 rounded-full"
          style={{
            background:
              'linear-gradient(90deg, var(--accent-red), var(--surface-tertiary), var(--accent-green))',
          }}
        />
        <span>Gain</span>
      </div>
    </div>
  );
}
