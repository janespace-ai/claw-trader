import { useTranslation } from 'react-i18next';
import { useWorkspaceDraftStore } from '@/stores/workspaceDraftStore';
import { FriendlyError } from '@/components/ui/FriendlyError';

interface Props {
  onRunPreview: () => void;
  isRunning: boolean;
  lastError?: string | null;
}

/**
 * Purple gradient "Ready for preview" card. Visible when the draft
 * store has a compilable strategy; otherwise renders a muted empty
 * state. The primary CTA mirrors the topbar button so the action is
 * reachable without scrolling up.
 */
export function RunPreviewCard({ onRunPreview, isRunning, lastError }: Props) {
  const { t } = useTranslation();
  const hasDraft = useWorkspaceDraftStore((s) => !!s.code);

  if (!hasDraft) {
    return null;
  }

  return (
    <div
      className="rounded-lg p-4 border border-accent-primary-dim flex flex-col gap-3"
      style={{
        background:
          'linear-gradient(135deg, var(--accent-primary-dim) 0%, transparent 100%)',
      }}
    >
      <div>
        <div className="text-xs uppercase tracking-wider text-accent-primary font-heading">
          {t('workspace.preview_card.ready')}
        </div>
        <div className="text-sm text-fg-secondary mt-1">
          {t('workspace.preview_card.body')}
        </div>
      </div>

      {lastError && (
        <FriendlyError
          variant="card"
          label={t('workspace.design.run_preview')}
          error={lastError}
        />
      )}

      <button
        type="button"
        onClick={onRunPreview}
        disabled={isRunning}
        className="self-start px-3 py-1.5 rounded-md bg-accent-primary text-fg-inverse text-xs font-semibold disabled:opacity-60"
      >
        {isRunning ? '…' : '▶ ' + t('workspace.design.run_preview')}
      </button>
    </div>
  );
}
