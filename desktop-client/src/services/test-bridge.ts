// Renderer-only test bridge. Installs `window.__claw` with deterministic
// hooks that Playwright visual specs can call before taking a screenshot.
//
// Strictly gated behind `import.meta.env.DEV`: production builds do not
// ship this file's exports (tree-shaken because `installTestBridge` is
// a no-op outside DEV).

import { useAppStore } from '@/stores/appStore';
import { useWorkspaceStore, type WorkspaceMode } from '@/stores/workspaceStore';
import { useSignalReviewStore } from '@/stores/signalReviewStore';
import { useOptimLensStore } from '@/stores/optimlensStore';
import type { AppRoute } from '@/types/navigation';
import type { components } from '@/types/api';

type SignalVerdict = components['schemas']['SignalVerdict'];
type SignalSummary = components['schemas']['SignalReviewResult']['summary'];

// `seedStrategistDraft` and `seedScreenerRun` were removed in Group 14
// cleanup along with their underlying stores (`workspaceDraftStore` and
// `screenerRunStore`).  When the new `strategySessionStore` lands
// (Group 3 of unified-strategy-workspace), re-introduce a single
// `seedStrategySession` helper that covers both the draft + the
// per-session symbol list.

interface PreviewSeed {
  taskId: string;
  mode?: WorkspaceMode;
  verdicts?: SignalVerdict[];
  summary?: SignalSummary;
  focusedSymbol?: string;
}

export function installTestBridge(): void {
  if (typeof window === 'undefined') return;
  if (!import.meta.env.DEV) return;
  const api = {
    /** Force-set the app route (bypasses navigation animations). */
    route(r: AppRoute) {
      useAppStore.getState().navigate(r);
      if (r.kind === 'workspace') {
        useWorkspaceStore.getState().enterDesign();
      }
    },
    /** Flip the Workspace view mode (Chart ↔ Grid). */
    setWorkspaceViewMode(mode: 'chart' | 'grid') {
      useWorkspaceStore.getState().setViewMode(mode);
    },
    /** Seed an OptimLens entry for Deep screen visual specs. */
    seedOptimLens(seed: {
      strategyId: string;
      improvements?: components['schemas']['OptimLensImprovement'][];
      baseMetrics?: components['schemas']['MetricsBlockExtended'];
    }) {
      useOptimLensStore.setState((prev) => ({
        byStrategy: {
          ...prev.byStrategy,
          [seed.strategyId]: {
            status: 'complete',
            taskId: 'SEED-OPTIM',
            improvements: seed.improvements ?? [],
            baseMetrics: seed.baseMetrics,
            dismissed: new Set(),
            error: null,
          },
        },
      }));
    },
    /** Seed a Preview Backtest context + verdicts for visual specs. */
    seedPreviewBacktest(seed: PreviewSeed) {
      const ws = useWorkspaceStore.getState();
      ws.enterPreview(ws.currentStrategyId ?? 'SEED-STRAT', seed.taskId);
      if (seed.focusedSymbol) ws.focus(seed.focusedSymbol);
      if (seed.mode && seed.mode !== 'preview') {
        if (seed.mode === 'deep') ws.enterDeep(seed.taskId);
        if (seed.mode === 'design') ws.enterDesign();
      }
      // Bypass the network by writing directly into the review store.
      useSignalReviewStore.setState((prev) => ({
        byBacktestTask: {
          ...prev.byBacktestTask,
          [seed.taskId]: {
            status: 'complete',
            reviewTaskId: 'SEED-REVIEW',
            verdicts: seed.verdicts ?? [],
            summary: seed.summary ?? {},
            error: null,
            selectedSignalId: null,
            pulseSignalId: null,
          },
        },
      }));
    },
  };
  (window as unknown as { __claw?: typeof api }).__claw = api;
}
