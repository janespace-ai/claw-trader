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
 * Left-rail symbol browser matching the Pencil `SymbolRail` design
 * (frame `Y6E6p`) and its `RailRow` component (`Ysu4M`):
 *
 *   - Header: "Symbols" label + count badge (accent-primary).
 *   - Each row is a two-column layout:
 *       • left (vertical, 2px gap):
 *           ticker    — Geist Mono, 11px, 500 weight, fg-primary
 *           subtitle  — Inter, 9px, normal, fg-muted
 *       • right:
 *           change%   — Geist Mono, 11px, 600 weight, green/red
 *   - Focused row: surface-tertiary background.
 *
 * Data mapping:
 *   - ticker comes from `Symbol.symbol` (rendered with `/` instead of `_`).
 *   - subtitle shows `rank + compact 24h-quote volume`, which is what
 *     `listSymbols` actually returns today.
 *   - change% is NOT in the `Symbol` schema yet — rendered as "—" in
 *     muted color. It'll light up automatically once the backend
 *     contract adds `change_24h_pct` to the list response.
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
      {/* Header — "Symbols" + count badge, matches Pencil `srH`. */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2.5">
        <span
          className="text-[11px] font-semibold text-fg-muted uppercase"
          style={{ letterSpacing: 0.5, fontFamily: 'Geist, sans-serif' }}
        >
          {t('symbol_list.header', { defaultValue: 'Symbols' })}
        </span>
        <span className="font-mono text-[11px] text-accent-primary">
          {rows.length}
        </span>
      </div>

      {/* Search input sits between header and rows — not in Pencil but
          essential for navigating a 200+ symbol list. */}
      <div className="px-2 pb-2 border-b border-border-subtle">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('symbol_picker.placeholder')}
          className="w-full bg-surface-primary text-xs font-mono px-2 py-1.5 rounded-sm outline-none"
        />
      </div>

      {/* Rows — Pencil `RailRow` (Ysu4M) layout. */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto py-1"
      >
        {filtered.map((row) => (
          <SymbolRailRow
            key={row.symbol}
            row={row}
            focused={row.symbol === focusedSymbol}
            onSelect={onSelect}
          />
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
  );
}

function SymbolRailRow({
  row,
  focused,
  onSelect,
}: {
  row: SymbolRow;
  focused: boolean;
  onSelect: (s: string) => void;
}) {
  // Left-column subtitle: rank + compact volume when both present;
  // falls back to whichever is available.
  const subtitle = useMemo(() => {
    const parts: string[] = [];
    if (row.rank != null) parts.push(`#${row.rank}`);
    if (row.volume_24h_quote != null && row.volume_24h_quote > 0) {
      parts.push(fmtVolume(row.volume_24h_quote));
    }
    return parts.length > 0 ? parts.join(' · ') : '—';
  }, [row]);

  return (
    <button
      type="button"
      onClick={() => onSelect(row.symbol)}
      className={[
        'w-full flex items-center gap-2 px-3 py-2 transition-colors text-left',
        focused
          ? 'bg-surface-tertiary'
          : 'hover:bg-[color:var(--surface-tertiary)]',
      ].join(' ')}
    >
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="font-mono text-[11px] font-medium text-fg-primary truncate">
          {formatTicker(row.symbol)}
        </span>
        <span className="text-[9px] text-fg-muted truncate">{subtitle}</span>
      </div>
      {/* Change% slot — muted "—" until the backend includes
          change_24h_pct in the list response. When it does, this
          cell colors green/red the same way Pencil's `rtPct` does. */}
      <span className="font-mono text-[11px] font-semibold text-fg-muted shrink-0">
        —
      </span>
    </button>
  );
}

function formatTicker(s: string): string {
  return s.includes('_') ? s.replace('_', '/') : s;
}

/** Compact 24h-volume formatter. $3.2M / $450K / $1.2B style. */
function fmtVolume(v: number): string {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
  return '$' + v.toFixed(0);
}
