import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cremote, toErrorBody } from '@/services/remote/contract-client';
import {
  useStrategySessionStore,
  type WorkspaceStrategy,
  type ChatMessage,
} from '@/stores/strategySessionStore';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { StrategyLibraryCard } from '@/components/library/StrategyLibraryCard';
import {
  LibraryFilterChips,
  type LibraryFilter,
} from '@/components/library/LibraryFilterChips';

/**
 * 策略库 tab — conversation-style strategy list.  Mirrors Pencil
 * reference frame `twKvt`.
 *
 * Top: heading + subtitle + [+ 创建新策略] CTA.
 * Filter row: chips + search box (name only, per spec).
 * List: vertical stack of StrategyLibraryCard rows, each backed by a
 * server `Strategy` row plus the most-recent chat message snippet
 * pulled from client SQLite (window.claw.db.strategyChats).
 *
 * Sort is fixed to updated_at desc (most-recent activity first).
 * Future: add a sort selector if user feedback demands it.
 */
export function LibraryScreen() {
  const { t } = useTranslation();
  const navigate = useAppStore((s) => s.navigate);
  const archiveCurrentDraftAndOpenNew = useStrategySessionStore(
    (s) => s.archiveCurrentDraftAndOpenNew,
  );
  const loadStrategy = useStrategySessionStore((s) => s.loadStrategy);

  const favoriteIds = useFavorites();
  const toggleFavorite = useToggleFavorite();

  const [strategies, setStrategies] = useState<WorkspaceStrategy[]>([]);
  const [snippets, setSnippets] = useState<Record<string, ChatMessage | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LibraryFilter>({ kind: 'all' });
  const [query, setQuery] = useState('');

  // Initial fetch.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    cremote
      .listStrategies({ limit: 100 })
      .then(async (page) => {
        if (cancelled) return;
        const list = page.items as WorkspaceStrategy[];
        setStrategies(list);
        // Fetch the last chat message per strategy from client SQLite.
        const db = (typeof window !== 'undefined' ? window.claw?.db : undefined) as
          | { strategyChats?: { list: (id: string) => Promise<ChatMessage[]> } }
          | undefined;
        const snips: Record<string, ChatMessage | null> = {};
        if (db?.strategyChats) {
          await Promise.all(
            list.map(async (s) => {
              try {
                const msgs = await db.strategyChats!.list(s.id);
                snips[s.id] = msgs.length > 0 ? msgs[msgs.length - 1] : null;
              } catch {
                snips[s.id] = null;
              }
            }),
          );
        }
        if (!cancelled) setSnippets(snips);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(`${describeErr(err)}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const c = { all: strategies.length, saved: 0, draft: 0, archived: 0, favorite: 0 };
    for (const s of strategies) {
      if (s.is_archived_draft) c.archived++;
      else if (s.saved_at) c.saved++;
      else c.draft++;
      if (favoriteIds.has(s.id)) c.favorite++;
    }
    return c;
  }, [strategies, favoriteIds]);

  const filtered = useMemo(() => {
    let out = strategies;
    if (filter.kind === 'saved') out = out.filter((s) => !!s.saved_at && !s.is_archived_draft);
    else if (filter.kind === 'draft')
      out = out.filter((s) => !s.saved_at && !s.is_archived_draft);
    else if (filter.kind === 'archived') out = out.filter((s) => s.is_archived_draft);
    else if (filter.kind === 'favorite') out = out.filter((s) => favoriteIds.has(s.id));

    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((s) => (s.name ?? '').toLowerCase().includes(q));
    }

    // Sort: updated_at desc (treat undefined as 0).
    return [...out].sort((a, b) => {
      const aT = (a.updated_at ?? 0) as number;
      const bT = (b.updated_at ?? 0) as number;
      return bT - aT;
    });
  }, [strategies, filter, query, favoriteIds]);

  const handleCreateNew = async () => {
    await archiveCurrentDraftAndOpenNew();
    navigate({ kind: 'workspace' });
  };

  const handleOpen = async (id: string) => {
    await loadStrategy(id);
    navigate({ kind: 'workspace' });
  };

  const subtitle = t('library.subtitle', {
    defaultValue: '{{total}} 个策略 · {{saved}} 已保存 · {{draft}} 草稿',
    total: strategies.length,
    saved: counts.saved,
    draft: counts.draft,
  });

  return (
    <div className="flex flex-col h-full px-7 py-10 gap-5 overflow-y-auto bg-surface-primary">
      {/* Header row */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-bold text-fg-primary">
            {t('library.title', { defaultValue: '策略库' })}
          </h1>
          <p className="text-[13px] text-fg-muted">{subtitle}</p>
        </div>
        <button
          onClick={handleCreateNew}
          className={
            'h-9 px-4 inline-flex items-center gap-1.5 rounded-md text-[13px] font-semibold ' +
            'bg-accent-primary text-fg-inverse hover:opacity-90 transition-opacity'
          }
        >
          <span aria-hidden>＋</span>
          {t('library.createNew', { defaultValue: '创建新策略' })}
        </button>
      </div>

      {/* Filters row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <LibraryFilterChips active={filter} onSelect={setFilter} counts={counts} />
        <div className="w-[280px] max-w-full h-8 px-3 rounded-md bg-surface-secondary border border-border-subtle flex items-center gap-2">
          <span aria-hidden className="text-fg-muted text-xs">
            🔍
          </span>
          <input
            type="text"
            placeholder={t('library.searchPlaceholder', { defaultValue: '按名字搜索…' })}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-[12px] text-fg-primary placeholder:text-fg-muted"
          />
        </div>
      </div>

      {/* List body */}
      {error ? (
        <ErrorState msg={error} />
      ) : loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState filter={filter.kind} hasAny={strategies.length > 0} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((s) => (
            <StrategyLibraryCard
              key={s.id}
              strategy={s}
              lastMessage={snippets[s.id] ?? null}
              favorite={favoriteIds.has(s.id)}
              onClick={() => void handleOpen(s.id)}
              onToggleFavorite={(next) => void toggleFavorite(s.id, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorState({ msg }: { msg: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-accent-red/40 bg-[color:var(--accent-red-dim)] p-5 text-[12px] text-accent-red">
      {t('library.error', { defaultValue: '加载策略失败：' })}
      <span className="font-mono ml-2">{msg}</span>
    </div>
  );
}

function LoadingState() {
  const { t } = useTranslation();
  return (
    <div className="text-[13px] text-fg-muted italic px-2 py-8">
      {t('library.loading', { defaultValue: '加载中…' })}
    </div>
  );
}

function EmptyState({ filter, hasAny }: { filter: LibraryFilter['kind']; hasAny: boolean }) {
  const { t } = useTranslation();
  if (!hasAny) {
    return (
      <div className="rounded-xl border border-dashed border-border-strong bg-surface-secondary p-10 text-center space-y-2">
        <div className="text-[14px] text-fg-primary font-semibold">
          {t('library.empty.title', { defaultValue: '还没有策略' })}
        </div>
        <div className="text-[12px] text-fg-muted">
          {t('library.empty.hint', {
            defaultValue: '点右上角「创建新策略」开始第一次对话。',
          })}
        </div>
      </div>
    );
  }
  return (
    <div className="text-[12px] text-fg-muted italic px-2 py-6">
      {t(`library.empty.filter.${filter}`, {
        defaultValue: '当前筛选下没有匹配项。',
      })}
    </div>
  );
}

// ---- Favorites: stored in client SQLite settings as a JSON array. ----

const FAV_KEY = 'library:favorites:v1';

function useFavorites(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    void readFavorites().then(setIds);
  }, []);
  return ids;
}

function useToggleFavorite() {
  return async (id: string, next: boolean) => {
    const cur = await readFavorites();
    if (next) cur.add(id);
    else cur.delete(id);
    await writeFavorites(cur);
  };
}

async function readFavorites(): Promise<Set<string>> {
  const claw = (typeof window !== 'undefined' ? window.claw : undefined) as
    | {
        db?: {
          settings?: { get: <T = unknown>(k: string) => Promise<T | null> };
        };
      }
    | undefined;
  const v = (await claw?.db?.settings?.get?.(FAV_KEY)) ?? null;
  if (Array.isArray(v)) return new Set(v.filter((x): x is string => typeof x === 'string'));
  return new Set();
}

async function writeFavorites(ids: Set<string>): Promise<void> {
  const claw = (typeof window !== 'undefined' ? window.claw : undefined) as
    | {
        db?: {
          settings?: { set: (k: string, v: unknown) => Promise<void> };
        };
      }
    | undefined;
  await claw?.db?.settings?.set?.(FAV_KEY, [...ids]);
}

void useSettingsStore; // (silence lint — settings store imported for future personalization)

function describeErr(err: unknown): string {
  const body = toErrorBody(err);
  return `${body.code}: ${body.message}`;
}
