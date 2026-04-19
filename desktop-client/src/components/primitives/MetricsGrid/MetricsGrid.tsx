export interface Metric {
  label: string;
  value: string | number | null;
  /** Optional unit like "%" or "x". */
  unit?: string;
  /** Optional colored delta line below the value. Positive = green, negative = red. */
  delta?: { value: number; direction: 'up' | 'down'; unit?: string };
  /** When "large", tile spans two columns and uses larger typography. */
  emphasis?: 'normal' | 'large';
}

interface Props {
  metrics: Metric[];
  /** Min column width in px for auto-fit grid. Default 140. */
  minColWidth?: number;
  className?: string;
}

/** Formats a value, rendering "—" for null and preserving numeric types. */
function formatValue(v: Metric['value']): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '—';
    if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return v.toFixed(2);
  }
  return String(v);
}

/**
 * Responsive grid of metric tiles. Emphasis=large takes 2 cols + larger
 * font. Auto-fits remaining tiles in `minmax(minColWidth, 1fr)`.
 */
export function MetricsGrid({ metrics, minColWidth = 140, className }: Props) {
  return (
    <div
      className={`grid gap-3 ${className ?? ''}`}
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(${minColWidth}px, 1fr))`,
      }}
    >
      {metrics.map((m, i) => {
        const large = m.emphasis === 'large';
        const deltaColor =
          m.delta?.direction === 'up' ? 'var(--accent-green)' : 'var(--accent-red)';
        const deltaPrefix = m.delta?.direction === 'up' ? '+' : '';
        return (
          <div
            key={`${m.label}-${i}`}
            className="bg-surface-secondary rounded-lg p-3 flex flex-col gap-1"
            style={large ? { gridColumn: 'span 2' } : undefined}
          >
            <span className="text-[10px] uppercase tracking-wider text-fg-muted">
              {m.label}
            </span>
            <span
              className={`font-data tabular-nums text-fg-primary ${large ? 'text-2xl' : 'text-lg'}`}
            >
              {formatValue(m.value)}
              {m.unit && (
                <span className="text-fg-muted ml-1 text-sm font-body">{m.unit}</span>
              )}
            </span>
            {m.delta && (
              <span
                className="font-mono text-[11px] tabular-nums"
                style={{ color: deltaColor }}
              >
                {deltaPrefix}
                {m.delta.value.toFixed(2)}
                {m.delta.unit ?? ''}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
