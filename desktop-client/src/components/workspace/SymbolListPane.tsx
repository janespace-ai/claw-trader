import { useTranslation } from 'react-i18next';
import { useStrategySessionStore } from '@/stores/strategySessionStore';

interface Props {
  /** When the user clicks a symbol row, focus chart on that symbol. */
  onFocusSymbol?: (symbol: string) => void;
  /** Currently focused symbol (highlighted in the list). */
  focusedSymbol?: string;
  /** Called when user clicks "AI 帮我改币种" — typically focuses chat input
   *  and pre-fills "去掉 / 加入 ..." or similar prompt. */
  onAskAI?: () => void;
}

/**
 * Left rail of the unified strategy workspace.  Renders the active
 * strategy's `draft_symbols` as a vertical list, with a count badge,
 * the strategy name, an empty-state when no symbols yet, and a primary
 * "AI 帮我改币种" button at the bottom.  Mirrors Pencil frame
 * `BPRNd` (master) — see docs/design/unified-strategy-workspace-frames.md.
 */
export function SymbolListPane({ onFocusSymbol, focusedSymbol, onAskAI }: Props) {
  const { t } = useTranslation();
  const strategy = useStrategySessionStore((s) => s.strategy);

  const symbols = strategy?.draft_symbols ?? [];
  const name = strategy?.name ?? t('workspace.untitled', { defaultValue: '未命名' });

  return (
    <div className="flex flex-col h-full">
      {/* Header — count pill + strategy name */}
      <div className="px-3.5 py-3 border-b border-border-subtle">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide">
            {t('workspace.symbols.label', { defaultValue: '币种' })}
          </span>
          <span
            className={
              'inline-flex items-center justify-center min-w-[1.25rem] h-[1.125rem] px-1.5 rounded-full ' +
              'text-[10px] font-mono font-semibold ' +
              (symbols.length > 0
                ? 'bg-[color:var(--accent-primary-dim)] text-accent-primary'
                : 'bg-surface-tertiary text-fg-muted')
            }
          >
            {symbols.length}
          </span>
        </div>
        <div
          className="font-heading text-[13px] font-semibold text-fg-primary truncate"
          title={name}
        >
          {name}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {symbols.length === 0 ? (
          <div className="px-3 py-6 text-[11px] text-fg-muted leading-relaxed">
            {t('workspace.symbols.empty', {
              defaultValue: '币列表会出现在这里。\n聊聊你想筛什么样的币，AI 会帮你筛。',
            })}
          </div>
        ) : (
          symbols.map((sym) => (
            <button
              key={sym}
              onClick={() => onFocusSymbol?.(sym)}
              className={
                'w-full text-left rounded-md px-3 py-2 mb-0.5 flex items-center justify-between ' +
                'transition-colors ' +
                (focusedSymbol === sym
                  ? 'bg-surface-tertiary text-fg-primary'
                  : 'hover:bg-surface-tertiary text-fg-secondary hover:text-fg-primary')
              }
            >
              <span className="font-mono text-[11px] font-semibold">{sym}</span>
            </button>
          ))
        )}
      </div>

      {/* Footer — AI button */}
      <div className="px-3 py-3 border-t border-border-subtle">
        <button
          onClick={onAskAI}
          className={
            'w-full h-8 inline-flex items-center justify-center gap-1.5 rounded-md ' +
            'bg-[color:var(--accent-primary-dim)] text-accent-primary border border-accent-primary ' +
            'text-[11px] font-semibold hover:opacity-90 transition-opacity'
          }
        >
          <span aria-hidden>✨</span>
          {t('workspace.symbols.askAI', { defaultValue: 'AI 帮我改币种' })}
        </button>
      </div>
    </div>
  );
}
