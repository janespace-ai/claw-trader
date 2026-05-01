import { create } from 'zustand';
import type { AppRoute, LegacyTab } from '@/types/navigation';
import { routeToLegacyTab } from '@/types/navigation';

/**
 * Top-level app state.
 *
 * `route: AppRoute` is the canonical route representation.  After the
 * unified-strategy-workspace change, the only top-level tabs are
 * `workspace` (创建/编辑策略, default) / `library` (策略库) / `settings`.
 * `currentTab` is derived for backward-compat during the rebuild.
 */
export type Tab = LegacyTab;

interface AppState {
  route: AppRoute;
  aiPanelWidth: number;
  aiPanelCollapsed: boolean;

  navigate: (route: AppRoute) => void;
  /** Convenience setter for the top-level tab.  Maps the simple tab
   *  identifier to a default AppRoute for that tab. */
  setTab: (t: 'workspace' | 'library' | 'settings') => void;
  setAIPanelWidth: (w: number) => void;
  toggleAIPanel: () => void;
}

const initialRoute: AppRoute = { kind: 'workspace' };

export const useAppStore = create<AppState & { currentTab: Tab }>((set, get) => ({
  route: initialRoute,
  // `currentTab` is a static field mirror; kept in sync inside navigate().
  // Using an actual field (not a getter) keeps it compatible with selectors
  // like `useAppStore((s) => s.currentTab)`.
  currentTab: routeToLegacyTab(initialRoute) ?? 'workspace',
  aiPanelWidth: 420,
  aiPanelCollapsed: false,

  navigate(route) {
    set({ route, currentTab: routeToLegacyTab(route) ?? get().currentTab });
  },
  setTab(t) {
    const route: AppRoute =
      t === 'library'
        ? { kind: 'library' }
        : t === 'settings'
          ? { kind: 'settings' }
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
