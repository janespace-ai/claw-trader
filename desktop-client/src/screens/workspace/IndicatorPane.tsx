import { useMemo } from 'react';
import type { IndicatorPoint } from '@/services/indicators';

interface LineSpec {
  data: IndicatorPoint[];
  color: string;
  label?: string;
  width?: number;
}

interface GuideSpec {
  value: number;
  color: string;
  dashed?: boolean;
}

interface Props {
  title: string;
  /** Latest value text rendered top-right (e.g. "31.5"). */
  latestLabel?: string;
  /** One or more lines to plot. All lines share the y-domain below. */
  lines: LineSpec[];
  /** Explicit y-domain. Defaults to the min/max across all supplied data. */
  domain?: { min: number; max: number };
  /** Horizontal reference lines (e.g. 30/70 for RSI, 0 for MACD). */
  guides?: GuideSpec[];
  /** Optional histogram series drawn as vertical bars behind the lines. */
  histogram?: IndicatorPoint[];
  height?: number;
}

/**
 * Self-contained SVG line pane for technical indicators whose y-range
 * differs from the price chart (RSI 0-100, Stochastic 0-100, MACD +/-,
 * ATR absolute, OBV cumulative). Chosen over a second lightweight-
 * charts instance because single pane + fixed domain is trivial in
 * SVG and avoids sync-scroll complexity.
 */
export function IndicatorPane({
  title,
  latestLabel,
  lines,
  domain,
  guides = [],
  histogram,
  height = 84,
}: Props) {
  const view = useMemo(() => {
    const all = lines.flatMap((l) => l.data);
    if (all.length === 0 && !histogram?.length) return null;

    const resolvedDomain = domain ?? (() => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of all) {
        if (p.value < lo) lo = p.value;
        if (p.value > hi) hi = p.value;
      }
      for (const p of histogram ?? []) {
        if (p.value < lo) lo = p.value;
        if (p.value > hi) hi = p.value;
      }
      if (lo === hi) {
        lo -= 1;
        hi += 1;
      }
      return { min: lo, max: hi };
    })();

    const width = 1000;
    const { min, max } = resolvedDomain;
    const span = max - min || 1;
    const y = (v: number) => height - ((v - min) / span) * height;

    // X axis: use the longest line to pick the denominator.
    const longest = lines.reduce(
      (n, l) => (l.data.length > n ? l.data.length : n),
      histogram?.length ?? 0,
    );
    const stepX = longest > 1 ? width / (longest - 1) : 0;

    // Each line is plotted using its own indices, but all mapped over
    // the same x-step so shorter lines (e.g. signal) stay aligned.
    const paths = lines.map((l) => {
      const offset = longest - l.data.length;
      return {
        d: l.data
          .map((p, i) =>
            `${i === 0 ? 'M' : 'L'}${((offset + i) * stepX).toFixed(2)},${y(p.value).toFixed(2)}`,
          )
          .join(' '),
        color: l.color,
        width: l.width ?? 1.5,
      };
    });

    const bars = histogram
      ? histogram.map((p, i) => {
          const offset = longest - histogram.length;
          const x = (offset + i) * stepX;
          const y0 = y(0);
          const yv = y(p.value);
          return {
            x,
            y: Math.min(y0, yv),
            w: stepX * 0.7,
            h: Math.abs(yv - y0),
            color: p.value >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
          };
        })
      : [];

    const guideLines = guides.map((g) => ({
      y: y(g.value),
      color: g.color,
      dashed: g.dashed !== false,
    }));

    return { width, paths, bars, guideLines };
  }, [lines, domain, guides, histogram, height]);

  if (!view) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-fg-muted border border-dashed border-border-subtle rounded"
        style={{ height }}
        aria-label={title}
      >
        {title} — no data
      </div>
    );
  }

  return (
    <div
      className="relative bg-surface-secondary rounded-md px-2 py-1"
      style={{ height: height + 18 }}
      aria-label={title}
    >
      <div className="flex items-center justify-between text-[10px] text-fg-muted">
        <span>{title}</span>
        {latestLabel != null && <span className="font-mono">{latestLabel}</span>}
      </div>
      <svg
        viewBox={`0 0 ${view.width} ${height}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
      >
        {/* Histogram bars behind the lines. */}
        {view.bars.map((b, i) => (
          <rect
            key={i}
            x={b.x - b.w / 2}
            y={b.y}
            width={b.w}
            height={b.h}
            fill={b.color}
            opacity={0.5}
          />
        ))}
        {view.guideLines.map((g, i) => (
          <line
            key={i}
            x1={0}
            y1={g.y}
            x2={view.width}
            y2={g.y}
            stroke={g.color}
            strokeDasharray={g.dashed ? '4 4' : undefined}
            strokeWidth={1}
            opacity={0.5}
          />
        ))}
        {view.paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill="none"
            stroke={p.color}
            strokeWidth={p.width}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}
