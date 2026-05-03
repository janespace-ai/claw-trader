import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUniverseStore } from '@/stores/universeStore';
import { useAppStore } from '@/stores/appStore';
import { recordEvent } from '@/services/featureFlags';

/**
 * Left rail of the workspace — full-market symbol browser.
 *
 * Workspace-three-zone-layout: this rail is decoupled from any
 * strategy.  Rows come from `useUniverseStore` (~200 symbols loaded
 * from `/api/symbols`).  Clicking a row sets the workspace's
 * `focusedSymbol` (mutex-highlighted with the "选出的币" tab).
 *
 * Pencil reference: frame `A7ubw` left rail.
 */
export function SymbolListPane() {
  const { t } = useTranslation();
  const symbols = useUniverseStore((s) => s.symbols);
  const loading = useUniverseStore((s) => s.loading);
  const error = useUniverseStore((s) => s.error);
  const loadUniverse = useUniverseStore((s) => s.loadUniverse);

  const focusedSymbol = useAppStore((s) => s.focusedSymbol);
  const setFocusedSymbol = useAppStore((s) => s.setFocusedSymbol);

  const [query, setQuery] = useState('');

  useEffect(() => {
    void loadUniverse();
  }, [loadUniverse]);

  const filtered = useMemo(() => {
    if (!query.trim()) return symbols;
    const q = query.trim().toLowerCase();
    return symbols.filter((s) => s.symbol.toLowerCase().includes(q));
  }, [symbols, query]);

  const handleClick = (sym: string) => {
    setFocusedSymbol(sym);
    recordEvent('focused_symbol_change', {
      source: 'left_rail',
      symbol: sym,
    });
  };

  return (
    <div className="flex flex-col h-full bg-surface-secondary border-r border-border-subtle">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-border-subtle">
        <span className="font-heading text-[14px] font-semibold text-fg-primary">
          {t('workspace.universe.header', { defaultValue: '全市场' })}
        </span>
        <span className="font-mono text-[11px] text-fg-muted">
          {symbols.length > 0
            ? t('workspace.universe.count', {
                count: symbols.length,
                defaultValue: '{{count}} 个币种',
              })
            : ''}
        </span>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5 border-b border-border-subtle">
        <div className="flex items-center gap-2 h-8 px-2.5 rounded-md bg-surface-tertiary">
          <span className="text-fg-muted" aria-hidden>
            ⌕
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('workspace.universe.search.placeholder', {
              defaultValue: '搜索币种',
            })}
            className="flex-1 bg-transparent outline-none text-[13px] text-fg-primary placeholder-fg-muted"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="px-4 py-6 text-[12px] text-accent-red leading-relaxed">
            {error}
          </div>
        ) : loading && symbols.length === 0 ? (
          <SkeletonRows />
        ) : filtered.length === 0 ? (
          <div className="px-4 py-6 text-[12px] text-fg-muted leading-relaxed">
            {query
              ? t('workspace.universe.noMatch', { defaultValue: '没有匹配的币种' })
              : t('workspace.universe.empty', { defaultValue: '暂无币种' })}
          </div>
        ) : (
          filtered.map((s) => (
            <UniverseRow
              key={s.symbol}
              symbol={s.symbol}
              focused={focusedSymbol === s.symbol}
              onClick={() => handleClick(s.symbol)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function UniverseRow(props: {
  symbol: string;
  focused: boolean;
  onClick: () => void;
}) {
  const { symbol, focused, onClick } = props;
  return (
    <button
      onClick={onClick}
      className={
        'w-full px-4 py-2.5 flex items-center justify-between text-left transition-colors ' +
        (focused
          ? 'bg-[color:var(--accent-primary-dim)] border-l-[3px] border-accent-primary'
          : 'hover:bg-surface-tertiary border-l-[3px] border-transparent')
      }
      data-focused={focused}
    >
      <span
        className={
          'font-mono text-[13px] ' +
          (focused ? 'text-fg-primary font-semibold' : 'text-fg-primary')
        }
      >
        {symbol}
      </span>
      {/* Price + 24h pct columns are populated by a future ticker
          subscription (out of scope for this change — universe
          endpoint doesn't return last price; engineers wire it in
          Group 11 telemetry phase). */}
    </button>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="px-4 py-2.5 flex items-center justify-between animate-pulse"
        >
          <span className="block h-3 w-20 bg-surface-tertiary rounded" />
          <span className="block h-3 w-12 bg-surface-tertiary rounded" />
        </div>
      ))}
    </>
  );
}
