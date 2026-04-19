import { useMemo } from 'react';
import type { IndicatorPoint } from '@/services/indicators';

interface Props {
  data: IndicatorPoint[];
  height?: number;
  /** Oversold / overbought threshold lines. Defaults to 30 / 70. */
  oversold?: number;
  overbought?: number;
}

/**
 * Tiny self-contained RSI pane. Rendered below the Candles chart so
 * the user can see overbought / oversold momentum without mixing y-axes
 * on the price chart (RSI lives in 0-100 space, candles in price space).
 *
 * Uses SVG rather than lightweight-charts because a single pane with a
 * fixed y-domain, two threshold guides, and one polyline is simpler to
 * implement correctly than a second chart instance with synced time
 * scales. Acceptable for the first pass; we can upgrade to a
 * lightweight-charts pane later if users want crosshair sync.
 */
export function RSIPane({ data, height = 72, oversold = 30, overbought = 70 }: Props) {
  const viewBox = useMemo(() => {
    if (data.length === 0) return null;
    const width = 1000; // arbitrary viewBox width — SVG scales to container
    const stepX = data.length > 1 ? width / (data.length - 1) : 0;
    // Map 0-100 to y ∈ [height, 0] (SVG y grows downward).
    const y = (v: number) => height - (v / 100) * height;
    const path = data
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(2)},${y(p.value).toFixed(2)}`)
      .join(' ');
    return {
      width,
      yOver: y(overbought),
      yUnder: y(oversold),
      y50: y(50),
      path,
    };
  }, [data, height, oversold, overbought]);

  if (!viewBox) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-fg-muted border border-dashed border-border-subtle rounded"
        style={{ height }}
      >
        RSI — no data
      </div>
    );
  }

  return (
    <div
      className="relative bg-surface-secondary rounded-md px-2 py-1"
      style={{ height: height + 18 }}
      aria-label="RSI"
    >
      <div className="flex items-center justify-between text-[10px] text-fg-muted">
        <span>RSI (14)</span>
        <span className="font-mono">{data[data.length - 1]?.value.toFixed(1) ?? '—'}</span>
      </div>
      <svg
        viewBox={`0 0 ${viewBox.width} ${height}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
      >
        {/* Guide lines at oversold / overbought. */}
        <line
          x1={0}
          y1={viewBox.yOver}
          x2={viewBox.width}
          y2={viewBox.yOver}
          stroke="var(--accent-red)"
          strokeDasharray="4 4"
          strokeWidth={1}
          opacity={0.5}
        />
        <line
          x1={0}
          y1={viewBox.yUnder}
          x2={viewBox.width}
          y2={viewBox.yUnder}
          stroke="var(--accent-green)"
          strokeDasharray="4 4"
          strokeWidth={1}
          opacity={0.5}
        />
        <line
          x1={0}
          y1={viewBox.y50}
          x2={viewBox.width}
          y2={viewBox.y50}
          stroke="var(--border-subtle)"
          strokeWidth={1}
          opacity={0.6}
        />
        <path
          d={viewBox.path}
          fill="none"
          stroke="var(--accent-primary)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
