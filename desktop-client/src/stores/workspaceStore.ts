import { create } from 'zustand';

/**
 * Workspace-internal state machine.
 *
 * Three sub-modes flow linearly:
 *   design → preview → deep
 *
 * The top-level `AppRoute` only says "user is in workspace"; this
 * store says which mode + what's the current strategy/task/symbol
 * context. Kept separate so other screens (screener, strategies,
 * symbol-detail) don't reach into workspace state.
 *
 * `viewMode` is reserved for `multi-symbol-grid` (future change)
 * but declared here so workspace screens can consume it without
 * a schema migration later.
 */
export type WorkspaceMode = 'design' | 'preview' | 'deep';
export type ViewMode = 'chart' | 'grid';

interface WorkspaceState {
  mode: WorkspaceMode;
  currentStrategyId: string | null;
  /** Current backtest task id (preview or deep, depending on mode). */
  currentTaskId: string | null;
  /** Which symbol is focused in the main chart / watchlist highlight. */
  focusedSymbol: string | null;
  /** Trade currently selected (drives Trade Analysis persona). */
  focusedTradeId: string | null;
  /** Main area layout (chart vs grid). Persists to localStorage. */
  viewMode: ViewMode;

  // ---- actions ----
  enterDesign: (strategyId?: string) => void;
  enterPreview: (strategyId: string, taskId: string) => void;
  enterDeep: (taskId: string) => void;
  back: () => void;
  focus: (symbol: string | null) => void;
  focusTrade: (tradeId: string | null) => void;
  setViewMode: (view: ViewMode) => void;
  reset: () => void;
}

const VIEW_MODE_KEY = 'workspace.viewMode';

function loadInitialViewMode(): ViewMode {
  if (typeof localStorage === 'undefined') return 'chart';
  const raw = localStorage.getItem(VIEW_MODE_KEY);
  return raw === 'grid' ? 'grid' : 'chart';
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  mode: 'design',
  currentStrategyId: null,
  currentTaskId: null,
  focusedSymbol: null,
  focusedTradeId: null,
  viewMode: loadInitialViewMode(),

  enterDesign(strategyId) {
    set({
      mode: 'design',
      currentStrategyId: strategyId ?? get().currentStrategyId,
    });
  },
  enterPreview(strategyId, taskId) {
    set({
      mode: 'preview',
      currentStrategyId: strategyId,
      currentTaskId: taskId,
    });
  },
  enterDeep(taskId) {
    set({ mode: 'deep', currentTaskId: taskId });
  },
  back() {
    const cur = get().mode;
    if (cur === 'deep') set({ mode: 'preview' });
    else if (cur === 'preview') set({ mode: 'design' });
    // 'design' has no "back" within the workspace.
  },
  focus(symbol) {
    set({ focusedSymbol: symbol });
  },
  focusTrade(tradeId) {
    set({ focusedTradeId: tradeId });
  },
  setViewMode(view) {
    set({ viewMode: view });
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(VIEW_MODE_KEY, view);
    }
  },
  reset() {
    set({
      mode: 'design',
      currentStrategyId: null,
      currentTaskId: null,
      focusedSymbol: null,
      focusedTradeId: null,
    });
  },
}));
