import { create } from 'zustand';

export type Tab = 'screener' | 'strategies' | 'backtest';

interface AppState {
  currentTab: Tab;
  aiPanelWidth: number;
  aiPanelCollapsed: boolean;

  setTab: (t: Tab) => void;
  setAIPanelWidth: (w: number) => void;
  toggleAIPanel: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentTab: 'backtest',
  aiPanelWidth: 420,
  aiPanelCollapsed: false,

  setTab(t) {
    set({ currentTab: t });
  },
  setAIPanelWidth(w) {
    set({ aiPanelWidth: Math.max(300, Math.min(600, w)) });
  },
  toggleAIPanel() {
    set({ aiPanelCollapsed: !get().aiPanelCollapsed });
  },
}));
