import { create } from 'zustand';
import { cremote, toErrorBody } from '@/services/remote/contract-client';
import type { components } from '@/types/api';

type ScreenerResult = components['schemas']['ScreenerResult'];
type ScreenerRowResult = components['schemas']['ScreenerRowResult'];

export type ScreenerRunStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'complete'
  | 'failed';

interface ScreenerRunState {
  status: ScreenerRunStatus;
  taskId: string | null;
  /** Last code that was submitted; lets the UI auto-re-run via the persona. */
  code: string | null;
  results: ScreenerRowResult[];
  focusedSymbol: string | null;
  error: string | null;
  /** Raw signals keyed by symbol — populated only if the contract exposes
   *  them. Today the contract doesn't; kept for forward-compat so the
   *  chart-markers wiring is already in place. */
  signalsBySymbol: Record<string, { ts: number; kind?: string }[]>;

  run: (params: {
    code: string;
    market?: 'futures';
    lookbackDays?: number;
    strategyId?: string;
  }) => Promise<void>;
  focus: (symbol: string | null) => void;
  seed: (partial: Partial<Pick<ScreenerRunState, 'results' | 'focusedSymbol'>>) => void;
  clear: () => void;
}

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 120;

export const useScreenerRunStore = create<ScreenerRunState>((set, get) => ({
  status: 'idle',
  taskId: null,
  code: null,
  results: [],
  focusedSymbol: null,
  error: null,
  signalsBySymbol: {},

  async run({ code, market = 'futures' as const, lookbackDays = 365, strategyId }) {
    if (get().status === 'running' || get().status === 'pending') return;
    set({ status: 'pending', code, error: null });
    try {
      const task = await cremote.startScreener({
        code,
        config: { market, lookback_days: lookbackDays },
        strategy_id: strategyId,
      });
      set({ status: 'running', taskId: task.task_id });

      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        const r = await cremote.getScreenerResult({ task_id: task.task_id });
        if (r.status === 'done') {
          const results = (r.result as ScreenerResult | undefined)?.results ?? [];
          const passed = results.find((x) => x.passed);
          set({
            status: 'complete',
            results,
            focusedSymbol: get().focusedSymbol ?? passed?.symbol ?? null,
          });
          return;
        }
        if (r.status === 'failed') {
          set({ status: 'failed', error: r.error?.message || r.error?.code || 'failed' });
          return;
        }
        await new Promise<void>((rsv) => setTimeout(rsv, POLL_INTERVAL_MS));
      }
      set({ status: 'failed', error: 'screener poll timed out' });
    } catch (err) {
      const body = toErrorBody(err);
      set({ status: 'failed', error: `${body.code}: ${body.message}` });
    }
  },

  focus(symbol) {
    set({ focusedSymbol: symbol });
  },

  seed(partial) {
    set((prev) => ({
      ...prev,
      results: partial.results ?? prev.results,
      focusedSymbol: partial.focusedSymbol ?? prev.focusedSymbol,
      status: partial.results ? 'complete' : prev.status,
    }));
  },

  clear() {
    set({
      status: 'idle',
      taskId: null,
      code: null,
      results: [],
      focusedSymbol: null,
      error: null,
      signalsBySymbol: {},
    });
  },
}));
