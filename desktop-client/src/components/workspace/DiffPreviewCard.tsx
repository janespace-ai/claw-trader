import { useTranslation } from 'react-i18next';

export type DiffMutationKind = 'code' | 'symbols';

export interface DiffPreviewProps {
  kind: DiffMutationKind;
  /** AI's one-line "why" for the change. */
  reason: string;
  /** Before/after content for display.  For 'code' this is the full
   *  raw diff body (already formatted with +/− line prefixes); for
   *  'symbols' it's a JSON-stringified before/after array. */
  before: string;
  after: string;
  /** Optional file label (e.g. "strategy.py").  Defaults to inferred. */
  filename?: string;
  /** True while the apply request is in flight (Apply button shows spinner). */
  applying?: boolean;
  /** True if the user already accepted/rejected — read-only state. */
  resolved?: 'applied' | 'rejected';
  /** Callbacks. */
  onApply: () => void;
  onReject: () => void;
}

/**
 * Inline message variant of the diff preview card.  Renders inside the
 * chat thread under an AI assistant message that proposes a draft_code
 * or draft_symbols mutation.  User MUST click [应用] or [拒绝] before
 * the underlying store gets updated — that's the safety net for
 * AI-driven mutations.  Mirrors Pencil frame `SfSed` (standalone) /
 * `TDCMf` (inline compact in OUv6E).
 */
export function DiffPreviewCard(props: DiffPreviewProps) {
  const { t } = useTranslation();
  const { kind, reason, before, after, filename, applying, resolved, onApply, onReject } = props;

  const fileLabel = filename ?? (kind === 'code' ? 'strategy.py' : 'symbols.json');

  const lines = useDiffLines(before, after);

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-tertiary overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle">
        <span aria-hidden className="text-accent-primary text-xs">
          ✦
        </span>
        <span className="flex-1 text-[11px] font-semibold text-fg-primary">
          {t('workspace.diff.title', { defaultValue: '代码改动' })}
        </span>
        <span className="inline-flex items-center px-1.5 h-[18px] rounded-full bg-[color:var(--accent-green-dim)] text-accent-green text-[10px] font-mono font-bold">
          +{lines.added}
        </span>
        <span className="inline-flex items-center px-1.5 h-[18px] rounded-full bg-[color:var(--accent-red-dim)] text-accent-red text-[10px] font-mono font-bold">
          −{lines.removed}
        </span>
        <span className="font-mono text-[10px] text-fg-muted">{fileLabel}</span>
      </div>

      {/* AI reason banner */}
      <div className="px-3 py-2 bg-[color:var(--accent-primary-dim)] border-b border-border-subtle flex items-start gap-1.5">
        <span aria-hidden className="text-accent-primary text-[11px] leading-tight">
          ⓘ
        </span>
        <span className="text-[11px] text-accent-primary leading-relaxed">{reason}</span>
      </div>

      {/* Diff body */}
      <div className="bg-surface-primary py-2 max-h-[280px] overflow-auto">
        {lines.lines.length === 0 ? (
          <div className="px-4 py-3 text-[11px] text-fg-muted italic">
            {t('workspace.diff.empty_diff', {
              defaultValue: '(改动太大，省略 diff 视图)',
            })}
          </div>
        ) : (
          lines.lines.map((line, i) => (
            <div
              key={i}
              className={
                'flex items-center gap-2 px-3 py-0.5 ' +
                (line.kind === 'add'
                  ? 'bg-[color:var(--accent-green-dim)]'
                  : line.kind === 'remove'
                    ? 'bg-[color:var(--accent-red-dim)]'
                    : '')
              }
            >
              <span
                className={
                  'font-mono text-[10px] tabular-nums w-7 text-right ' +
                  (line.kind === 'add'
                    ? 'text-accent-green'
                    : line.kind === 'remove'
                      ? 'text-accent-red'
                      : 'text-fg-muted')
                }
              >
                {line.lineNo}
              </span>
              <span
                className={
                  'font-mono text-[10px] leading-relaxed flex-1 ' +
                  (line.kind === 'add'
                    ? 'text-accent-green'
                    : line.kind === 'remove'
                      ? 'text-accent-red'
                      : 'text-fg-secondary')
                }
              >
                {line.content}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border-subtle">
        {resolved === 'applied' ? (
          <span className="text-[11px] text-accent-green font-medium">
            ✓ {t('workspace.diff.applied', { defaultValue: '已应用' })}
          </span>
        ) : resolved === 'rejected' ? (
          <span className="text-[11px] text-fg-muted italic">
            {t('workspace.diff.rejected', { defaultValue: '已拒绝' })}
          </span>
        ) : (
          <>
            <button
              onClick={onReject}
              disabled={applying}
              className={
                'h-7 px-3 rounded-md text-[11px] font-medium border border-border-strong ' +
                'text-fg-secondary hover:text-fg-primary hover:bg-surface-tertiary ' +
                'disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
              }
            >
              {t('workspace.diff.reject', { defaultValue: '拒绝' })}
            </button>
            <button
              onClick={onApply}
              disabled={applying}
              className={
                'h-7 px-3 rounded-md text-[11px] font-semibold ' +
                'bg-accent-primary text-fg-inverse hover:opacity-90 ' +
                'disabled:opacity-50 disabled:cursor-not-allowed transition-opacity'
              }
            >
              {applying
                ? t('workspace.diff.applying', { defaultValue: '应用中…' })
                : `✓ ${t('workspace.diff.apply', { defaultValue: '应用' })}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface DiffLine {
  kind: 'context' | 'add' | 'remove';
  lineNo: string;
  content: string;
}

interface DiffSummary {
  added: number;
  removed: number;
  lines: DiffLine[];
}

/** Compute a simple line-by-line diff summary for display.  Not a true
 *  Myers diff — for the v1 chat use-case where AI emits whole-block
 *  replacements, a raw before/after split is plenty.  Group 7 of
 *  unified-strategy-workspace will swap this for a proper diff lib if
 *  the AI starts emitting fine-grained patches. */
function useDiffLines(before: string, after: string): DiffSummary {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  // Naive: emit all `before` lines as "remove", all `after` lines as
  // "add", capped at 100 lines total to keep the card small.
  const lines: DiffLine[] = [];
  beforeLines.forEach((c, i) => {
    if (lines.length >= 50) return;
    if (c.trim().length === 0) return;
    lines.push({ kind: 'remove', lineNo: String(i + 1), content: c });
  });
  afterLines.forEach((c, i) => {
    if (lines.length >= 100) return;
    if (c.trim().length === 0) return;
    lines.push({ kind: 'add', lineNo: String(i + 1), content: c });
  });
  return {
    added: afterLines.filter((l) => l.trim().length > 0).length,
    removed: beforeLines.filter((l) => l.trim().length > 0).length,
    lines,
  };
}
