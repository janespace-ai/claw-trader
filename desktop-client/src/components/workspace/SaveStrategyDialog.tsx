import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  /** Pre-filled name (AI-suggested or current strategy.name).  Empty
   *  string is fine — the dialog won't enable Save until it's filled. */
  initialName: string;
  /** Stats shown in the "将保存：" section so the user sees what they're
   *  committing to.  Keep it factual, not editable. */
  summary: {
    code_lines?: number;
    symbol_count?: number;
    last_pnl_pct?: number | null;
  };
  /** Whether the save POST is in flight. */
  saving: boolean;
  /** Validation / API error to surface inline. */
  errorMsg?: string | null;
  onCancel: () => void;
  /** Called with the entered (and trimmed) name when the user clicks Save. */
  onConfirm: (name: string) => void;
}

/**
 * Modal that appears the FIRST time a user clicks 保存策略 (i.e. when
 * `strategy.saved_at` is null).  Subsequent saves overwrite without
 * prompting.  Mirrors Pencil frame `Od6yq` (480×360).
 */
export function SaveStrategyDialog({
  initialName,
  summary,
  saving,
  errorMsg,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus + select text on open so user can immediately overwrite.
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && !saving;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSave) onConfirm(trimmedName);
  };

  return (
    // Modal backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-dialog-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-[480px] max-w-[90vw] rounded-xl bg-surface-secondary border border-border-subtle shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <span className="text-accent-primary" aria-hidden>
              💾
            </span>
            <h2
              id="save-dialog-title"
              className="font-heading text-base font-bold text-fg-primary"
            >
              {t('workspace.save.title', { defaultValue: '保存策略' })}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-fg-muted hover:text-fg-primary text-lg leading-none disabled:opacity-50"
            aria-label={t('action.cancel')}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3.5">
          {/* Name input */}
          <div className="space-y-1.5">
            <label
              htmlFor="save-name"
              className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide"
            >
              {t('workspace.save.name_label', { defaultValue: '策略名称' })}
            </label>
            <input
              ref={inputRef}
              id="save-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              placeholder={t('workspace.save.name_placeholder', {
                defaultValue: '给这个策略起个名字…',
              })}
              className={
                'w-full h-9 px-3 rounded-md text-sm bg-surface-tertiary border border-accent-primary ' +
                'text-fg-primary placeholder:text-fg-muted ' +
                'focus:outline-none focus:ring-2 focus:ring-accent-primary/40 ' +
                'disabled:opacity-60 disabled:cursor-not-allowed'
              }
            />
          </div>

          {/* AI hint — only show if initialName looks AI-suggested
              (heuristic: the user didn't edit it yet, AND it's not empty) */}
          {initialName && name === initialName && (
            <div className="rounded-md bg-[color:var(--accent-primary-dim)] px-3 py-2 flex items-start gap-1.5">
              <span aria-hidden className="text-accent-primary text-[11px]">
                ✨
              </span>
              <span className="text-[11px] text-accent-primary leading-relaxed">
                {t('workspace.save.ai_hint', {
                  defaultValue: 'AI 已根据对话内容预填名字。',
                })}
              </span>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-md bg-surface-tertiary px-3 py-2.5 space-y-1">
            <div className="text-[11px] font-semibold text-fg-muted">
              {t('workspace.save.will_save', { defaultValue: '将保存：' })}
            </div>
            {summary.code_lines != null && (
              <div className="text-[11px] text-fg-secondary">
                ·{' '}
                {t('workspace.save.summary.code', {
                  defaultValue: '策略代码 ({{n}} 行)',
                  n: summary.code_lines,
                })}
              </div>
            )}
            {summary.symbol_count != null && (
              <div className="text-[11px] text-fg-secondary">
                ·{' '}
                {t('workspace.save.summary.symbols', {
                  defaultValue: '币种列表 ({{n}} 个)',
                  n: summary.symbol_count,
                })}
              </div>
            )}
            {summary.last_pnl_pct != null && (
              <div className="text-[11px] text-fg-secondary">
                ·{' '}
                {t('workspace.save.summary.last_pnl', {
                  defaultValue: '上次回测结果 ({{pct}})',
                  pct: `${summary.last_pnl_pct >= 0 ? '+' : ''}${summary.last_pnl_pct.toFixed(1)}%`,
                })}
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="rounded-md bg-[color:var(--accent-red-dim)] text-accent-red text-[11px] px-3 py-2">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-subtle">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className={
              'h-9 px-4 rounded-md text-[13px] font-medium border border-border-strong ' +
              'text-fg-secondary hover:text-fg-primary hover:bg-surface-tertiary ' +
              'disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
            }
          >
            {t('action.cancel', { defaultValue: '取消' })}
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className={
              'h-9 px-5 rounded-md text-[13px] font-semibold inline-flex items-center gap-1.5 ' +
              'bg-accent-primary text-fg-inverse hover:opacity-90 ' +
              'disabled:opacity-50 disabled:cursor-not-allowed transition-opacity'
            }
          >
            {saving ? (
              <>
                <span className="animate-spin" aria-hidden>
                  ⟳
                </span>
                {t('workspace.save.saving', { defaultValue: '保存中…' })}
              </>
            ) : (
              <>
                <span aria-hidden>✓</span>
                {t('workspace.save.confirm', { defaultValue: '保存' })}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
