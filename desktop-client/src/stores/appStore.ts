import { create } from 'zustand';
import type { AppRoute, LegacyTab } from '@/types/navigation';
import { routeToLegacyTab } from '@/types/navigation';

/**
 * Top-level app state.
 *
 * `route: AppRoute` is the canonical route representation. The legacy
 * `currentTab` is derived from it for backward compat during the
 * migration — existing code reading `currentTab` continues to work
 * until each call-site is ported.
 */
export type Tab = LegacyTab;

interface AppState {
  route: AppRoute;
  aiPanelWidth: number;
  aiPanelCollapsed: boolean;

  navigate: (route: AppRoute) => void;
  /** @deprecated Use navigate({ kind: ... }). Kept for backward compat. */
  setTab: (t: Tab) => void;
  setAIPanelWidth: (w: number) => void;
  toggleAIPanel: () => void;
}

const initialRoute: AppRoute = { kind: 'workspace' };

export const useAppStore = create<AppState & { currentTab: Tab }>((set, get) => ({
  route: initialRoute,
  // `currentTab` is a static field mirror; kept in sync inside navigate().
  // Using an actual field (not a getter) keeps it compatible with selectors
  // like `useAppStore((s) => s.currentTab)`.
  currentTab: routeToLegacyTab(initialRoute) ?? 'backtest',
  aiPanelWidth: 420,
  aiPanelCollapsed: false,

  navigate(route) {
    set({ route, currentTab: routeToLegacyTab(route) ?? get().currentTab });
  },
  setTab(t) {
    const route: AppRoute =
      t === 'screener'
        ? { kind: 'screener' }
        : t === 'strategies'
          ? { kind: 'strategies' }
          : { kind: 'workspace' };
    set({ route, currentTab: t });
  },
  setAIPanelWidth(w) {
    set({ aiPanelWidth: Math.max(300, Math.min(600, w)) });
  },
  toggleAIPanel() {
    set({ aiPanelCollapsed: !get().aiPanelCollapsed });
  },
}));
