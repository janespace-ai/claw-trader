import { useTranslation } from 'react-i18next';

export type LibraryFilter =
  | { kind: 'all' }
  | { kind: 'saved' }
  | { kind: 'draft' }
  | { kind: 'archived' }
  | { kind: 'favorite' };

export interface FilterChipsProps {
  active: LibraryFilter;
  onSelect: (next: LibraryFilter) => void;
  /** Counts displayed in chip labels. */
  counts: {
    all: number;
    saved: number;
    draft: number;
    archived: number;
    favorite: number;
  };
}

/**
 * Library tab's filter chips.  Replaces the old library's
 * favorite / archived chips with: 全部 / 已保存 / 草稿 / 归档草稿 / 收藏.
 * Mirrors Pencil reference frame `twKvt`'s chip row.
 */
export function LibraryFilterChips({ active, onSelect, counts }: FilterChipsProps) {
  const { t } = useTranslation();

  const chips: Array<{ k: LibraryFilter; label: string; n: number }> = [
    { k: { kind: 'all' }, label: t('library.filter.all', { defaultValue: '全部' }), n: counts.all },
    {
      k: { kind: 'saved' },
      label: t('library.filter.saved', { defaultValue: '已保存' }),
      n: counts.saved,
    },
    {
      k: { kind: 'draft' },
      label: t('library.filter.draft', { defaultValue: '草稿' }),
      n: counts.draft,
    },
    {
      k: { kind: 'archived' },
      label: t('library.filter.archived', { defaultValue: '归档草稿' }),
      n: counts.archived,
    },
    {
      k: { kind: 'favorite' },
      label: t('library.filter.favorite', { defaultValue: '收藏' }),
      n: counts.favorite,
    },
  ];

  return (
    <div className="flex items-center gap-1.5 flex-wrap" role="tablist">
      {chips.map((c) => {
        const isActive = c.k.kind === active.kind;
        return (
          <button
            key={c.k.kind}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(c.k)}
            className={
              'h-7 px-3 rounded-full text-[12px] inline-flex items-center gap-1 transition-colors ' +
              (isActive
                ? 'bg-surface-tertiary text-fg-primary font-semibold'
                : 'border border-border-subtle text-fg-secondary hover:text-fg-primary hover:bg-surface-tertiary/40')
            }
          >
            {c.k.kind === 'favorite' && <span aria-hidden>★</span>}
            <span>{c.label}</span>
            {c.n > 0 && <span className="text-fg-muted/80 font-mono text-[10px]">({c.n})</span>}
          </button>
        );
      })}
    </div>
  );
}
