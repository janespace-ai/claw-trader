import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cremote } from '@/services/remote/contract-client';
import type { components } from '@/types/api';

type SymbolRow = components['schemas']['Symbol'];

interface Props {
  /** The currently focused symbol — highlighted in the list. */
  focusedSymbol: string;
  /** Called when the user clicks a symbol row. */
  onSelect: (symbol: string) => void;
}

/**
 * Left-rail symbol browser inspired by Gate's trade-page sidebar.
 * Loads symbols from `cremote.listSymbols` (cursor-paginated),
 * supports client-side search over what's already loaded, and
 * infinite-scrolls the next page when the user reaches the bottom.
 *
 * Each row shows just the ticker plus its server-side rank (when
 * provided) — we intentionally omit per-symbol latest price to avoid
 * N round-trips; the market strip + chart already give the user
 * that info for the focused symbol.
 */
export function SymbolList({ focusedSymbol, onSelect }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<SymbolRow[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Initial fetch.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    cremote
      .listSymbols({ market: 'futures', limit: 200 })
      .then((page) => {
        if (cancelled) return;
        setRows(page.items);
        setCursor(page.next_cursor);
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setCursor(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const page = await cremote.listSymbols({
        market: 'futures',
        limit: 200,
        cursor,
      });
      setRows((prev) => [...prev, ...page.items]);
      setCursor(page.next_cursor);
    } catch {
      /* keep existing rows */
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((r) => r.symbol.toUpperCase().includes(q));
  }, [rows, query]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || !cursor || loading) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
      void loadMore();
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-secondary border-r border-border-subtle">
      <div className="p-2 border-b border-border-subtle">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('symbol_picker.placeholder')}
          className="w-full bg-surface-primary text-xs font-mono px-2 py-1.5 rounded-sm outline-none"
        />
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto"
      >
        {filtered.map((row) => {
          const isFocused = row.symbol === focusedSymbol;
          return (
            <button
              key={row.symbol}
              type="button"
              onClick={() => onSelect(row.symbol)}
              className={[
                'w-full text-left px-3 py-1.5 text-xs font-mono flex items-center justify-between border-b border-border-subtle/40',
                isFocused
                  ? 'bg-[color:var(--accent-primary-dim)] text-accent-primary'
                  : 'text-fg-primary hover:bg-surface-tertiary',
              ].join(' ')}
            >
              <span>{formatTicker(row.symbol)}</span>
              {row.rank != null && (
                <span className="text-[10px] text-fg-muted">#{row.rank}</span>
              )}
            </button>
          );
        })}
        {loading && (
          <div className="px-3 py-2 text-[11px] text-fg-muted text-center">
            {t('symbol_picker.loading')}
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="px-3 py-4 text-[11px] text-fg-muted text-center">
            {t('symbol_picker.no_results')}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTicker(s: string): string {
  return s.includes('_') ? s.replace('_', '/') : s;
}
