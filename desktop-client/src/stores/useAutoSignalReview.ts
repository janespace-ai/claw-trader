import { useEffect } from 'react';
import { useSignalReviewStore } from './signalReviewStore';

/**
 * Auto-kick Signal Review once per backtest task id. The store itself
 * is idempotent (start() no-ops when the entry is already pending /
 * running / complete), so this hook can safely live inside a screen
 * that remounts.
 */
export function useAutoSignalReview(backtestTaskId: string | null): void {
  const start = useSignalReviewStore((s) => s.start);

  useEffect(() => {
    if (!backtestTaskId) return;
    void start(backtestTaskId);
  }, [backtestTaskId, start]);
}
