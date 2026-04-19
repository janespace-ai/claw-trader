import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AIPersonaShell, WorkspaceShell } from '@/components/primitives';
import { StrategyCard } from '@/components/strategy/StrategyCard';
import { StrategyHistoryPanel } from '@/components/strategy/StrategyHistoryPanel';
import { useAppStore } from '@/stores/appStore';
import { useStrategyStore } from '@/stores/strategyStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useWorkspaceDraftStore } from '@/stores/workspaceDraftStore';

type Filter = 'all' | 'favorites' | 'active' | 'archived';

/**
 * Strategy Management screen.
 * Pencil frame `pGjNd` (dark) / `PLr19` (light).
 */
export function StrategiesScreen() {
  const { t } = useTranslation();
  const list = useStrategyStore((s) => s.list);
  const load = useStrategyStore((s) => s.load);
  const toggleFav = useStrategyStore((s) => s.toggleFavorite);
  const setStatus = useStrategyStore((s) => s.setStatus);
  const duplicate = useStrategyStore((s) => s.duplicate);
  const selectedId = useStrategyStore((s) => s.selectedId);
  const select = useStrategyStore((s) => s.select);
  const setCurrent = useStrategyStore((s) => s.setCurrent);

  const enterDesign = useWorkspaceStore((s) => s.enterDesign);
  const draftClear = useWorkspaceDraftStore((s) => s.clear);
  const navigate = useAppStore((s) => s.navigate);

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return list.filter((s) => {
      if (filter === 'favorites' && !s.is_favorite) return false;
      if (filter === 'active' && s.status !== 'active') return false;
      if (filter === 'archived' && s.status !== 'inactive') return false;
      if (query && !s.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [list, filter, query]);

  const handleOpen = (id: string) => {
    const s = list.find((x) => x.id === id);
    if (!s) return;
    setCurrent(s);
    enterDesign(id);
    navigate({ kind: 'workspace' });
  };

  const handleNew = () => {
    draftClear();
    enterDesign();
    navigate({ kind: 'workspace' });
  };

  const handleDuplicate = async (id: string) => {
    try {
      const newId = await duplicate(id);
      await load();
      select(newId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleToggleFav = async (id: string, value: boolean) => {
    try {
      await toggleFav(id, value);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleArchive = async (id: string, cur: 'active' | 'inactive') => {
    try {
      await setStatus(id, cur === 'active' ? 'inactive' : 'active');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <WorkspaceShell
      topbar={
        <div className="flex items-center justify-between h-14 px-5 bg-surface-secondary border-b border-border-subtle">
          <div className="flex items-baseline gap-3">
            <span className="font-heading font-semibold text-sm">{t('strategy.title')}</span>
            <span className="text-xs text-fg-muted">
              {t('strategy.count_summary', {
                saved: list.length,
                favorites: list.filter((s) => s.is_favorite).length,
              })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('strategy.search')}
              className="px-3 py-1.5 rounded-md bg-surface-tertiary text-xs w-56"
            />
            <button
              onClick={handleNew}
              className="px-3 py-1.5 rounded-md bg-accent-primary text-fg-inverse text-xs font-semibold"
            >
              {t('action.new_strategy')}
            </button>
          </div>
        </div>
      }
      leftRail={
        <div className="p-3">
          <div className="flex flex-col gap-1 text-xs">
            {(['all', 'favorites', 'active', 'archived'] as Filter[]).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={
                  'text-left px-2 py-1.5 rounded-md ' +
                  (filter === k
                    ? 'bg-surface-tertiary text-fg-primary'
                    : 'text-fg-secondary hover:text-fg-primary hover:bg-surface-secondary')
                }
              >
                {t(`strategy.tabs.${k}`)}{' '}
                <span className="text-[10px] text-fg-muted ml-1">
                  ({list.filter((s) => {
                    if (k === 'all') return true;
                    if (k === 'favorites') return s.is_favorite;
                    if (k === 'active') return s.status === 'active';
                    return s.status === 'inactive';
                  }).length})
                </span>
              </button>
            ))}
          </div>
        </div>
      }
      main={
        <div className="p-4 space-y-4">
          {error && <div className="text-xs text-accent-red">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((s) => (
              <StrategyCard
                key={s.id}
                strategy={s}
                selected={selectedId === s.id}
                onOpen={() => handleOpen(s.id)}
                onSelect={() => select(s.id)}
                onDuplicate={() => void handleDuplicate(s.id)}
                onToggleFavorite={() => void handleToggleFav(s.id, !s.is_favorite)}
                onArchive={() =>
                  void handleArchive(s.id, s.status === 'active' ? 'active' : 'inactive')
                }
              />
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full text-center text-fg-muted text-sm py-10">
                {t('strategy.no_match')}
              </div>
            )}
          </div>
        </div>
      }
      rightRail={
        <AIPersonaShell
          persona="strategy-history"
          context={{ strategyId: selectedId }}
        >
          <div className="flex-1 overflow-y-auto">
            <StrategyHistoryPanel strategyId={selectedId} />
          </div>
        </AIPersonaShell>
      }
    />
  );
}
