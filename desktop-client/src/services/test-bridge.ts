// Renderer-only test bridge. Installs `window.__claw` with deterministic
// hooks that Playwright visual specs can call before taking a screenshot.
//
// Strictly gated behind `import.meta.env.DEV`: production builds do not
// ship this file's exports (tree-shaken because `installTestBridge` is
// a no-op outside DEV).

import { useAppStore } from '@/stores/appStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useWorkspaceDraftStore } from '@/stores/workspaceDraftStore';
import type { AppRoute } from '@/types/navigation';
import type { StrategySummary } from '@/services/prompt/personas/parsers';

interface StrategistDraftSeed {
  strategyId?: string;
  summary: StrategySummary;
  code: string;
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
    /** Seed a strategist draft for deterministic visual-regression shots. */
    seedStrategistDraft(draft: StrategistDraftSeed) {
      useWorkspaceDraftStore.getState().setDraft({
        strategyId: draft.strategyId,
        summary: draft.summary,
        code: draft.code,
      });
    },
  };
  (window as unknown as { __claw?: typeof api }).__claw = api;
}
