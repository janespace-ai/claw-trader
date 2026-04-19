import { useEffect, useRef } from 'react';
import { Mini } from '../ClawChart/Mini';

export interface WatchlistItem {
  symbol: string;
  /** Sparkline data, either numeric series or {ts, value} points. */
  series?: number[] | { ts: number; value: number }[];
  /** Per-row headline text (e.g. "+12.5%", displayed right-aligned). */
  stat?: string;
  /** Color for the stat text. Defaults to accent-primary if omitted. */
  statColor?: string;
  /** Arbitrary left-of-symbol badge (rank, status dot, etc.). */
  badge?: string;
  /** Disables interaction. Used to render empty-state rows. */
  disabled?: boolean;
}

interface Props {
  items: WatchlistItem[];
  focused?: string | null;
  onFocus?: (symbol: string) => void;
  /** Fixed row height in px. Defaults to 56. */
  rowHeight?: number;
  className?: string;
  /** Optional title shown at the top of the list. */
  title?: string;
}

/**
 * Vertical symbol list with inline mini sparklines. Controlled
 * component — consumer supplies items + focus state. Keyboard ↑/↓
 * wraps at edges when the container has focus.
 */
export function Watchlist({
  items,
  focused,
  onFocus,
  rowHeight = 56,
  className,
  title,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !onFocus) return;
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement !== el) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const idx = items.findIndex((it) => it.symbol === focused);
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const len = items.length;
      if (len === 0) return;
      const next = items[((idx >= 0 ? idx : 0) + delta + len) % len];
      if (!next.disabled) onFocus(next.symbol);
    };
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, [items, focused, onFocus]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={`flex flex-col outline-none ${className ?? ''}`}
    >
      {title && (
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-fg-muted">
          {title}
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {items.map((item) => {
          const isFocused = item.symbol === focused;
          return (
            <button
              type="button"
              key={item.symbol}
              disabled={item.disabled}
              onClick={() => onFocus?.(item.symbol)}
              className={[
                'w-full flex items-center gap-2 px-3 text-left transition-colors',
                isFocused
                  ? 'bg-surface-tertiary'
                  : 'hover:bg-surface-secondary',
                item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
              style={{ height: rowHeight }}
            >
              {item.badge && (
                <span className="text-[10px] font-mono text-fg-muted w-6 text-center">
                  {item.badge}
                </span>
              )}
              <span className="font-mono text-xs text-fg-primary w-16 truncate">
                {item.symbol}
              </span>
              <div className="flex-1 min-w-0">
                {item.series && <Mini data={item.series} height={28} />}
              </div>
              {item.stat && (
                <span
                  className="font-mono text-xs tabular-nums"
                  style={{ color: item.statColor ?? 'var(--accent-primary)' }}
                >
                  {item.stat}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
