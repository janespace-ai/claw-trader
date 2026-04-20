import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cremote } from '@/services/remote/contract-client';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { components } from '@/types/api';

type SymbolRow = components['schemas']['Symbol'];

const INTERVALS = ['5m', '15m', '30m', '1h', '4h', '1d'] as const;

interface Props {
  symbol: string;
  onSymbolChange: (s: string) => void;
  interval: (typeof INTERVALS)[number];
  onIntervalChange: (iv: (typeof INTERVALS)[number]) => void;
  onRunPreview: () => void;
  canRunPreview: boolean;
  isRunning: boolean;
}

/** Topbar for the Strategy Design workspace.
 *  Indicators (SMA/EMA/BB/RSI) were moved out of this bar and now live
 *  in a `ChartIndicatorBar` rendered beneath the Candles chart, matching
 *  the Pencil layout where the top bar is reserved for symbol/timeframe
 *  + the primary Run Preview CTA.
 */
export function StrategyTopbar({
  symbol,
  onSymbolChange,
  interval,
  onIntervalChange,
  onRunPreview,
  canRunPreview,
  isRunning,
}: Props) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const focused = useWorkspaceStore((s) => s.focusedSymbol) ?? symbol;

  return (
    <div className="flex items-center justify-between h-full px-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="font-mono text-sm text-fg-primary hover:bg-surface-tertiary rounded-md px-2 py-1"
        >
          {focused} ▾
        </button>
        <div className="flex gap-1">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => onIntervalChange(iv)}
              className={[
                'text-xs px-2 py-1 rounded',
                iv === interval
                  ? 'bg-surface-tertiary text-fg-primary'
                  : 'text-fg-muted hover:text-fg-primary',
              ].join(' ')}
            >
              {iv}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onRunPreview}
        disabled={!canRunPreview || isRunning}
        className={[
          'px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
          canRunPreview && !isRunning
            ? 'bg-accent-primary text-fg-inverse hover:opacity-90'
            : 'bg-surface-tertiary text-fg-muted cursor-not-allowed',
        ].join(' ')}
      >
        {isRunning ? '…' : '✦ ' + t('workspace.design.run_preview')}
      </button>

      {pickerOpen && (
        <SymbolPicker
          current={focused}
          onPick={(s) => {
            onSymbolChange(s);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Searchable dropdown that loads the full active-symbol list from
 * `cremote.listSymbols` once, caches it across re-opens, and filters
 * client-side as the user types. Cursor-based pagination fetches the
 * next page automatically when the scroll container nears the bottom.
 */
function SymbolPicker({
  current,
  onPick,
  onClose,
}: {
  current: string;
  onPick: (s: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [all, setAll] = useState<SymbolRow[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Autofocus the search input when the picker mounts so the user
  // can start typing immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Initial fetch. Subsequent pages triggered by scroll.
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
      // leave what we have
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

  return (
    <div
      // Click-outside captures on the backdrop so the user can dismiss
      // by clicking anywhere. `stopPropagation` on the inner panel
      // keeps a click inside the list from bubbling up and closing it.
      className="fixed inset-0 z-20"
      onClick={onClose}
    >
      <div
        className="absolute top-16 left-4 bg-surface-secondary border border-border-subtle rounded-md shadow-lg min-w-[240px] max-w-[320px]"
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
