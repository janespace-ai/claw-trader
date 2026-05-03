import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useStrategySessionStore } from '@/stores/strategySessionStore';
import { useAppStore } from '@/stores/appStore';
import { recordEvent } from '@/services/featureFlags';

/**
 * "选出的币" tab content — workspace center-bottom default tab.
 *
 * Two sections:
 *  - Upper "草稿 (N)" — chips of strategy.draft_symbols with "×" remove.
 *  - Lower "上次 AI 筛出 (M)" — table of lastFilteredSymbols.symbols
 *    with per-row "+ 加入" and a header "+ 全部加入草稿".
 *
 * Spec: coin-screening-ui delta · ADDED requirements 2-3.
 * Pencil reference: `A7ubw` center-bottom contents.
 */
export function FilteredSymbolsTab() {
  const { t } = useTranslation();
  const strategy = useStrategySessionStore((s) => s.strategy);
  const lastFiltered = useStrategySessionStore((s) => s.lastFilteredSymbols);
  const patchDraft = useStrategySessionStore((s) => s.patchDraft);

  const focusedSymbol = useAppStore((s) => s.focusedSymbol);
  const setFocusedSymbol = useAppStore((s) => s.setFocusedSymbol);

  const draftSymbols = strategy?.draft_symbols ?? [];
  const draftSet = useMemo(() => new Set(draftSymbols), [draftSymbols]);

  const handleRemoveDraft = async (sym: string) => {
    const next = draftSymbols.filter((s) => s !== sym);
    await patchDraft({ draftSymbols: next });
  };

  const handleAddOne = async (sym: string) => {
    if (draftSet.has(sym)) return;
    const next = [...draftSymbols, sym];
    await patchDraft({ draftSymbols: next });
    recordEvent('filtered_add', { mode: 'one', symbol: sym, count: 1 });
  };

  const handleAddAll = async () => {
    if (!lastFiltered) return;
    const additions = lastFiltered.symbols.filter((s) => !draftSet.has(s));
    if (additions.length === 0) return;
    const next = [...draftSymbols, ...additions];
    await patchDraft({ draftSymbols: next });
    recordEvent('filtered_add', { mode: 'all', count: additions.length });
  };

  const handleFocus = (sym: string, source: 'draft' | 'filtered') => {
    setFocusedSymbol(sym);
    recordEvent('focused_symbol_change', {
      source: source === 'draft' ? 'draft_chip' : 'filtered_table',
      symbol: sym,
    });
  };

  return (
    <div className="flex flex-col">
      {/* Upper section: draft chips */}
      <section className="px-5 py-3 bg-surface-secondary flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="font-heading text-[13px] font-semibold text-fg-primary">
            {t('workspace.tabs.filtered.draftSection.title', {
              defaultValue: '草稿 · {{count}} 个币',
              count: draftSymbols.length,
            })}
          </span>
          <span className="text-[11px] text-fg-muted">
            {t('workspace.tabs.filtered.draftSection.subtitle', {
              defaultValue: '将作为下一次回测的币种',
            })}
          </span>
        </div>
        {draftSymbols.length === 0 ? (
          <div className="text-[12px] text-fg-muted py-1">
            {t('workspace.tabs.filtered.draftSection.empty', {
              defaultValue: '暂无草稿币种 · 点下面"+ 加入"或"+ 全部加入草稿"',
            })}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {draftSymbols.map((sym) => (
              <button
                key={sym}
                onClick={() => handleFocus(sym, 'draft')}
                className={
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md ' +
                  'transition-colors ' +
                  (focusedSymbol === sym
                    ? 'bg-[color:var(--accent-primary-dim)] border border-accent-primary'
                    : 'bg-surface-tertiary hover:bg-surface-tertiary/80 border border-transparent')
                }
              >
                <span className="font-mono text-[12px] text-fg-primary">
                  {sym}
                </span>
                <span
                  role="button"
                  aria-label={t('workspace.tabs.filtered.removeDraftAria', {
                    defaultValue: '从草稿移除 {{sym}}',
                    sym,
                  })}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRemoveDraft(sym);
                  }}
                  className="text-[13px] text-fg-muted hover:text-fg-primary cursor-pointer leading-none"
                >
                  ×
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Lower section: AI-filtered table */}
      <section className="px-5 py-3 flex flex-col gap-2 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="font-heading text-[13px] font-semibold text-fg-primary">
              {t('workspace.tabs.filtered.lastRunSection.title', {
                defaultValue: '上次 AI 筛出 · {{count}} 个',
                count: lastFiltered?.symbols.length ?? 0,
              })}
            </span>
            {lastFiltered?.criteria && (
              <span className="text-[11px] text-fg-muted">
                {lastFiltered.criteria}
              </span>
            )}
          </div>
          {lastFiltered && lastFiltered.symbols.length > 0 && (
            <button
              onClick={handleAddAll}
              className={
                'h-6 px-2.5 rounded-md bg-accent-primary text-fg-inverse ' +
                'text-[12px] font-semibold hover:opacity-90'
              }
            >
              {t('workspace.tabs.filtered.addAll', {
                defaultValue: '+ 全部加入草稿',
              })}
            </button>
          )}
        </div>

        {!lastFiltered || lastFiltered.symbols.length === 0 ? (
          <div className="py-6 text-[12px] text-fg-muted leading-relaxed">
            {t('workspace.tabs.filtered.empty', {
              defaultValue: '还没让 AI 筛过 · 跟右边 AI 描述你想要的标准',
            })}
          </div>
        ) : (
          <div className="bg-surface-secondary rounded-md overflow-hidden">
            <div className="px-3 py-2 flex items-center border-b border-border-subtle text-[11px] font-semibold text-fg-muted">
              <span className="w-32">
                {t('workspace.tabs.filtered.col.symbol', { defaultValue: '币种' })}
              </span>
              <span className="flex-1">
                {t('workspace.tabs.filtered.col.action', { defaultValue: '操作' })}
              </span>
            </div>
            {lastFiltered.symbols.map((sym) => {
              const inDraft = draftSet.has(sym);
              return (
                <button
                  key={sym}
                  onClick={() => handleFocus(sym, 'filtered')}
                  className={
                    'w-full px-3 py-2 flex items-center text-left ' +
                    'border-b border-border-subtle last:border-b-0 transition-colors ' +
                    (focusedSymbol === sym
                      ? 'bg-[color:var(--accent-primary-dim)]'
                      : 'hover:bg-surface-tertiary/40')
                  }
                >
                  <span className="w-32 font-mono text-[12px] text-fg-primary">
                    {sym}
                  </span>
                  <span className="flex-1">
                    <span
                      role="button"
                      aria-disabled={inDraft}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!inDraft) void handleAddOne(sym);
                      }}
                      className={
                        'inline-flex items-center px-2 py-0.5 rounded-sm ' +
                        'text-[11px] cursor-pointer ' +
                        (inDraft
                          ? 'bg-surface-tertiary text-fg-muted cursor-default'
                          : 'bg-surface-tertiary text-fg-primary hover:bg-[color:var(--accent-primary-dim)]')
                      }
                    >
                      {inDraft
                        ? t('workspace.tabs.filtered.row.added', {
                            defaultValue: '✓ 已加入',
                          })
                        : t('workspace.tabs.filtered.row.add', {
                            defaultValue: '+ 加入',
                          })}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
