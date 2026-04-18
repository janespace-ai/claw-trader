import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStrategyStore } from '@/stores/strategyStore';

type FilterKind = 'all' | 'favorites' | 'active' | 'archived';

export function StrategiesPage() {
  const { t } = useTranslation();
  const list = useStrategyStore((s) => s.list);
  const setCurrent = useStrategyStore((s) => s.setCurrent);
  const toggleFav = useStrategyStore((s) => s.toggleFavorite);
  const setStatus = useStrategyStore((s) => s.setStatus);

  const [filter, setFilter] = useState<FilterKind>('all');
  const [query, setQuery] = useState('');

  const filtered = list.filter((s) => {
    if (filter === 'favorites' && !s.is_favorite) return false;
    if (filter === 'active' && s.status !== 'active') return false;
    if (filter === 'archived' && s.status !== 'inactive') return false;
    if (query && !(s.name.toLowerCase().includes(query.toLowerCase()))) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-heading text-xl font-semibold">{t('strategy.title')}</div>
          <div className="text-xs text-fg-muted mt-1">
            {list.length} saved · {list.filter((s) => s.is_favorite).length} favorite
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search strategies…"
          className="px-3 py-2 rounded-md bg-surface-secondary text-sm w-64"
        />
        <div className="flex bg-surface-secondary rounded-md p-1 text-xs">
          {(['all', 'favorites', 'active', 'archived'] as FilterKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={
                'px-3 py-1.5 rounded-sm ' +
                (filter === k ? 'bg-surface-tertiary text-fg-primary' : 'text-fg-secondary')
              }
            >
              {t(`strategy.tabs.${k}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {filtered.map((s) => (
          <div key={s.id} className="bg-surface-secondary rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleFav(s.id, !s.is_favorite)}
                    className={s.is_favorite ? 'text-accent-yellow' : 'text-fg-muted'}
                  >
                    ★
                  </button>
                  <span className="font-heading font-semibold text-sm">{s.name}</span>
                </div>
                <div className="text-[10px] text-fg-muted mt-0.5">
                  v{s.version} · {s.type} · {s.status}
                </div>
              </div>
              <button
                onClick={() => setCurrent(s)}
                className="text-xs text-accent-primary hover:underline"
              >
                Open
              </button>
            </div>
            {s.description && (
              <div className="text-xs text-fg-secondary line-clamp-2">{s.description}</div>
            )}
            <div className="flex gap-3 text-[10px] text-fg-muted">
              <span>Updated {s.updated_at}</span>
              <button
                onClick={() => setStatus(s.id, s.status === 'active' ? 'inactive' : 'active')}
                className="ml-auto text-fg-secondary hover:text-fg-primary"
              >
                {s.status === 'active' ? 'Archive' : 'Reactivate'}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-3 text-center text-fg-muted text-sm py-10">
            No strategies match the current filter.
          </div>
        )}
      </div>
    </div>
  );
}
