import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cremote } from '@/services/remote/contract-client';
import type { components } from '@/types/api';

type SymbolRow = components['schemas']['Symbol'];

interface Props {
  /** Currently selected symbol — highlighted in the list. */
  current: string;
  /** Called with the chosen symbol when the user picks a row. */
  onPick: (symbol: string) => void;
  /** Called when the picker requests dismissal (backdrop / Esc). */
  onClose: () => void;
  /** Absolute positioning anchor; defaults to "below the caller". */
  anchor?: { top: number; left: number };
}

/**
 * Searchable symbol dropdown used by any UI element that lets the user
 * switch the focused futures symbol. Loads the full list from
 * `cremote.listSymbols` with cursor pagination; filters client-side as
 * the user types.
 *
 * Extracted out of `StrategyTopbar` so the new Gate-style `MarketStrip`
 * ticker button can reuse it without duplicating the fetch / scroll /
 * pagination logic.
 */
export function SymbolPicker({ current, onPick, onClose, anchor }: Props) {
  const { t } = useTranslation();
  const [all, setAll] = useState<SymbolRow[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Autofocus the search field on mount so the user can type right away.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape closes the picker without making a selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Initial fetch; subsequent pages triggered by scroll.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    cremote
      .listSymbols({ market: 'futures', limit: 200 })
      .then((page) => {
        if (cancelled) return;
        setAll(page.items);
        setCursor(page.next_cursor);
      })
      .catch(() => {
        if (cancelled) return;
        setAll([]);
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
      setAll((prev) => [...prev, ...page.items]);
      setCursor(page.next_cursor);
    } catch {
      // leave what we have on transient network failure
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return all;
    return all.filter((row) => row.symbol.toUpperCase().includes(q));
  }, [all, query]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || !cursor || loading) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
      void loadMore();
    }
  };

  const panelStyle: React.CSSProperties = anchor
    ? { top: anchor.top, left: anchor.left }
    : { top: 64, left: 16 };

  return (
    // Click-outside captures on the backdrop so the user can dismiss
    // by clicking anywhere. `stopPropagation` on the inner panel
    // keeps a click inside the list from bubbling up and closing it.
    <div className="fixed inset-0 z-30" onClick={onClose}>
      <div
        className="absolute bg-surface-secondary border border-border-subtle rounded-md shadow-lg min-w-[240px] max-w-[320px]"
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-2 border-b border-border-subtle">
          <input
            ref={inputRef}
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
          className="max-h-80 overflow-y-auto"
        >
          {filtered.map((row) => (
            <button
              key={row.symbol}
              type="button"
              onClick={() => onPick(row.symbol)}
              className={[
                'w-full text-left px-3 py-1.5 text-xs font-mono flex items-center justify-between hover:bg-surface-tertiary',
                row.symbol === current ? 'text-accent-primary' : 'text-fg-primary',
              ].join(' ')}
            >
              <span>{row.symbol}</span>
              {row.rank != null && (
                <span className="text-[10px] text-fg-muted">#{row.rank}</span>
              )}
            </button>
          ))}
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
    </div>
  );
}
