import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cremote } from '@/services/remote/contract-client';
import { useOptimLensStore } from '@/stores/optimlensStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { applyImprovement, PatchError } from '@/services/strategyPatcher';
import { ImprovementCard } from './ImprovementCard';
import type { components } from '@/types/api';

type OptimLensImprovement = components['schemas']['OptimLensImprovement'];

interface Props {
  strategyId: string;
}

/**
 * Renders the OptimLens improvement list for one strategy. Handles
 * Apply (patch code → createStrategyVersion → return to Strategy
 * Design) and Dismiss / Undismiss interactions with the store.
 */
export function ImprovementList({ strategyId }: Props) {
  const { t } = useTranslation();
  const entry = useOptimLensStore((s) => s.byStrategy[strategyId]);
  const dismiss = useOptimLensStore((s) => s.dismiss);
  const undismiss = useOptimLensStore((s) => s.undismiss);
  const enterDesign = useWorkspaceStore((s) => s.enterDesign);
  // workspaceDraftStore removed in Group 14 cleanup.  When the new
  // strategySessionStore (Group 3 of unified-strategy-workspace) lands,
  // re-wire these to its selectors.  For now ImprovementList always
  // fetches the latest saved code from the backend, which is the safer
  // default anyway (no stale draft race).
  const setDraft = (_args: unknown): void => { void _args; };
  const draftSummary: { name?: string } | null = null;
  const draftCode = '';

  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const onApply = useCallback(
    async (im: OptimLensImprovement) => {
      const key = im.title || 'im';
      setApplyingKey(key);
      setError(null);
      try {
        // Prefer the live draft code; fall back to backend fetch.
        let code = draftCode;
        if (!code) {
          const s = await cremote.getStrategy({ id: strategyId });
          code = s.code ?? '';
        }
        if (!code) throw new PatchError('No strategy code to patch', 'invalid_payload');
        const patched = applyImprovement(code, im.suggested_change);
        const version = await cremote.createStrategyVersion({
          strategy_id: strategyId,
          body: {
            code: patched,
            summary: `OptimLens: ${im.title}`,
          },
        });
        if (draftSummary && setDraft) {
          setDraft({ strategyId, summary: draftSummary, code: patched });
        }
        enterDesign(strategyId);
        setToast(t('workspace.optimlens.version_created', { n: version.version }));
        dismiss(strategyId, key);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        setApplyingKey(null);
      }
    },
    [draftCode, draftSummary, enterDesign, setDraft, strategyId, dismiss],
  );

  if (!entry || entry.status === 'idle') {
    return (
      <div className="text-xs text-fg-muted italic p-3">
        {t('workspace.optimlens.idle')}
      </div>
    );
  }
  if (entry.status === 'pending' || entry.status === 'running') {
    return <div className="text-xs text-fg-muted p-3">{t('workspace.optimlens.running')}</div>;
  }
  if (entry.status === 'unavailable') {
    return (
      <div className="text-xs text-fg-muted p-3 border border-border-subtle rounded-md">
        {t('workspace.optimlens.unavailable')}
      </div>
    );
  }
  if (entry.status === 'failed') {
    return (
      <div className="text-xs text-accent-red p-3">
        {t('workspace.optimlens.failed', { err: entry.error ?? '' })}
      </div>
    );
  }

  const active: OptimLensImprovement[] = [];
  const dismissed: OptimLensImprovement[] = [];
  entry.improvements.forEach((im) => {
    const key = im.title || '';
    if (entry.dismissed.has(key)) dismissed.push(im);
    else active.push(im);
  });

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-xs text-accent-red bg-[color:var(--accent-red-dim)] rounded-md px-2 py-1">
          {error}
        </div>
      )}
      {toast && (
        <div className="text-xs text-accent-green bg-[color:var(--accent-green-dim)] rounded-md px-2 py-1">
          {toast}
        </div>
      )}
      {active.length === 0 && dismissed.length === 0 && (
        <div className="text-xs text-fg-muted italic">
          {t('workspace.optimlens.no_improvements')}
        </div>
      )}
      {active.map((im, i) => (
        <ImprovementCard
          key={im.title + '-' + i}
          index={i}
          improvement={im}
          onApply={onApply}
          onDismiss={(k) => dismiss(strategyId, k)}
          isApplying={applyingKey === (im.title || 'im')}
        />
      ))}
      {dismissed.length > 0 && (
        <details>
          <summary className="text-xs text-fg-muted cursor-pointer">
            {t('workspace.improvement.dismissed_count', { n: dismissed.length })}
          </summary>
          <div className="space-y-3 mt-2">
            {dismissed.map((im, i) => (
              <ImprovementCard
                key={'d-' + im.title + '-' + i}
                index={entry.improvements.indexOf(im)}
                improvement={im}
                isDismissed
                onApply={onApply}
                onDismiss={(k) => dismiss(strategyId, k)}
                onUndismiss={(k) => undismiss(strategyId, k)}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
