import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useStrategyStore } from '@/stores/strategyStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';

interface Props {
  strategyId: string | null;
}

/**
 * Right-rail panel listing all versions of the selected strategy.
 * Duplicate + Revert actions emit new versions or new strategies
 * through the strategyStore.
 */
export function StrategyHistoryPanel({ strategyId }: Props) {
  const versions = useStrategyStore((s) => (strategyId ? s.versions[strategyId] : undefined));
  const listVersions = useStrategyStore((s) => s.listVersions);
  const revertTo = useStrategyStore((s) => s.revertTo);
  const duplicate = useStrategyStore((s) => s.duplicate);
  const enterDesign = useWorkspaceStore((s) => s.enterDesign);
  const navigate = useAppStore((s) => s.navigate);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevert, setConfirmRevert] = useState<number | null>(null);

  useEffect(() => {
    if (!strategyId) return;
    setLoading(true);
    setError(null);
    listVersions(strategyId)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [strategyId, listVersions]);

  if (!strategyId) {
    return (
      <div className="text-xs text-fg-muted italic p-3">
        Select a strategy to see its version history.
      </div>
    );
  }

  const handleRevert = async (v: number) => {
    if (!strategyId) return;
    try {
      await revertTo(strategyId, v);
      setConfirmRevert(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDuplicate = async () => {
    if (!strategyId) return;
    try {
      const newId = await duplicate(strategyId);
      enterDesign(newId);
      navigate({ kind: 'workspace' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase text-fg-muted">Versions</div>
        <button
          onClick={handleDuplicate}
          className="text-xs text-accent-primary hover:underline"
        >
          Duplicate & improve
        </button>
      </div>

      {error && <div className="text-xs text-accent-red">{error}</div>}
      {loading && <div className="text-xs text-fg-muted">Loading versions…</div>}
      {!loading && (!versions || versions.length === 0) && (
        <div className="text-xs text-fg-muted italic">No versions recorded yet.</div>
      )}

      <div className="space-y-2">
        {(versions ?? []).map((v) => (
          <div
            key={`${v.strategy_id}-${v.version}`}
            className="bg-surface-secondary rounded-md p-2.5 text-xs space-y-1.5"
          >
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-surface-tertiary font-mono text-[10px]">
                v{v.version}
              </span>
              {v.parent_version != null && v.parent_version !== v.version - 1 && (
                <span className="text-[10px] text-accent-yellow" title="Branched from older version">
                  ⑂
                </span>
              )}
              <span className="text-fg-muted text-[10px] ml-auto">
                {new Date(v.created_at * 1000).toLocaleDateString()}
              </span>
            </div>
            {v.summary && <div className="text-fg-secondary">{v.summary}</div>}
            <div className="flex items-center gap-2 pt-1">
              {confirmRevert === v.version ? (
                <>
                  <button
                    onClick={() => void handleRevert(v.version)}
                    className="text-[11px] text-accent-red hover:underline"
                  >
                    Confirm revert
                  </button>
                  <button
                    onClick={() => setConfirmRevert(null)}
                    className="text-[11px] text-fg-muted hover:text-fg-primary"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmRevert(v.version)}
                  className="text-[11px] text-fg-secondary hover:text-fg-primary"
                >
                  Revert to this
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
