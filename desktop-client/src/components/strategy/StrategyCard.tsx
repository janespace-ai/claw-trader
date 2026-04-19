import { useEffect, useState } from 'react';
import { ClawChart } from '@/components/primitives';
import { cremote } from '@/services/remote/contract-client';
import type { Strategy } from '@/types/domain';

interface Props {
  strategy: Strategy;
  selected?: boolean;
  onOpen: () => void;
  onSelect: () => void;
  onDuplicate: () => void;
  onToggleFavorite: () => void;
  onArchive: () => void;
}

interface MiniSeries {
  ts: number;
  value: number;
}

/**
 * Strategy card tile — Pencil primitive `IQK4J`. Fetches the latest
 * backtest's equity curve via `listBacktestHistory` + `getBacktestResult`
 * on mount and caches as local state; shows "No backtests yet" on empty.
 */
export function StrategyCard({
  strategy: s,
  selected,
  onOpen,
  onSelect,
  onDuplicate,
  onToggleFavorite,
  onArchive,
}: Props) {
  const [series, setSeries] = useState<MiniSeries[] | null>(null);
  const [lastReturn, setLastReturn] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const history = await cremote.listBacktestHistory({
          strategy_id: s.id,
          limit: 1,
        });
        const first = history.items[0];
        if (!first) return;
        const res = await cremote.getBacktestResult({ task_id: first.id });
        const curve = (res.result as { equity_curve?: { ts: number; value: number }[] } | undefined)
          ?.equity_curve;
        if (cancelled) return;
        if (curve && curve.length > 0) {
          setSeries(curve);
          const first_v = curve[0].value;
          const last_v = curve[curve.length - 1].value;
          setLastReturn(first_v > 0 ? (last_v - first_v) / first_v : null);
        }
      } catch {
        // Quietly ignore — card falls back to "No backtests yet".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [s.id]);

  const returnClass =
    lastReturn == null
      ? 'text-fg-muted'
      : lastReturn >= 0
        ? 'text-accent-green'
        : 'text-accent-red';

  return (
    <div
      onClick={onSelect}
      className={
        'bg-surface-secondary rounded-lg p-4 space-y-3 border cursor-pointer relative ' +
        (selected ? 'border-accent-primary' : 'border-border-subtle hover:border-accent-primary-dim')
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
              className={s.is_favorite ? 'text-accent-yellow' : 'text-fg-muted hover:text-accent-yellow'}
              aria-label={s.is_favorite ? 'Unfavorite' : 'Favorite'}
            >
              ★
            </button>
            <span className="font-heading font-semibold text-sm truncate">{s.name}</span>
          </div>
          <div className="text-[10px] text-fg-muted mt-0.5">
            v{s.version} · {s.type} · {s.status}
          </div>
        </div>
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="text-fg-muted hover:text-fg-primary text-sm px-1"
            aria-label="More actions"
          >
            ⋯
          </button>
          {menuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-6 bg-surface-primary border border-border-subtle rounded-md text-xs shadow-lg z-10 py-1 min-w-[120px]"
            >
              <button
                onClick={() => {
                  onDuplicate();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-surface-secondary"
              >
                Duplicate
              </button>
              <button
                onClick={() => {
                  onArchive();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-surface-secondary"
              >
                {s.status === 'active' ? 'Archive' : 'Reactivate'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="h-14">
        {series && series.length > 0 ? (
          <ClawChart.Mini data={series} height={56} />
        ) : (
          <div className="h-full grid place-items-center text-[10px] text-fg-muted border border-dashed border-border-subtle rounded">
            No backtests yet
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className={'font-mono text-sm ' + returnClass}>
          {lastReturn == null ? '—' : (lastReturn >= 0 ? '+' : '') + (lastReturn * 100).toFixed(2) + '%'}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="text-xs text-accent-primary hover:underline"
        >
          Open
        </button>
      </div>

      {s.description && (
        <div className="text-[11px] text-fg-secondary line-clamp-2">{s.description}</div>
      )}
    </div>
  );
}
