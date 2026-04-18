import { create } from 'zustand';
import type { BacktestResultRecord } from '@/types/domain';
import { pollBacktestResult, remote } from '@/services/remote/client';

type Phase = 'idle' | 'preview' | 'deep' | 'done' | 'error';

interface BacktestState {
  phase: Phase;
  taskId: string | null;
  progress: any;
  result: any | null;
  cached: BacktestResultRecord[];

  runPreview: (strategyId: string, code: string, config: any) => Promise<void>;
  runDeep: (strategyId: string, code: string, config: any) => Promise<void>;
  cacheResult: (r: BacktestResultRecord) => Promise<void>;
  loadCached: (strategyId?: string) => Promise<void>;
  reset: () => void;
}

export const useBacktestStore = create<BacktestState>((set, get) => ({
  phase: 'idle',
  taskId: null,
  progress: null,
  result: null,
  cached: [],

  async runPreview(strategyId, code, config) {
    set({ phase: 'preview', progress: null, result: null });
    const payload = { code, config: { ...config }, strategy_id: strategyId, mode: 'single' as const };
    const r = await remote.startBacktest(payload);
    set({ taskId: r.task_id });
    try {
      const result = await pollBacktestResult(r.task_id, (p) => set({ progress: p }));
      set({ result, phase: 'done' });
      await get().cacheResult({
        id: crypto.randomUUID(),
        strategy_id: strategyId,
        type: 'preview',
        symbols: config.symbols ?? [],
        config,
        summary_metrics: result?.result?.metrics ?? null,
        per_symbol_metrics: result?.result?.per_symbol ?? null,
        equity_curve: result?.result?.equity_curve ?? null,
        trades: result?.result?.trades ?? null,
        remote_task_id: r.task_id,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('preview failed', err);
      set({ phase: 'error' });
    }
  },

  async runDeep(strategyId, code, config) {
    set({ phase: 'deep', progress: null, result: null });
    const payload = { code, config: { ...config }, strategy_id: strategyId, mode: 'single' as const };
    const r = await remote.startBacktest(payload);
    set({ taskId: r.task_id });
    try {
      const result = await pollBacktestResult(r.task_id, (p) => set({ progress: p }));
      set({ result, phase: 'done' });
      await get().cacheResult({
        id: crypto.randomUUID(),
        strategy_id: strategyId,
        type: 'full',
        symbols: config.symbols ?? [],
        config,
        summary_metrics: result?.result?.metrics ?? null,
        per_symbol_metrics: result?.result?.per_symbol ?? null,
        equity_curve: result?.result?.equity_curve ?? null,
        trades: result?.result?.trades ?? null,
        remote_task_id: r.task_id,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('deep backtest failed', err);
      set({ phase: 'error' });
    }
  },

  async cacheResult(r) {
    await window.claw.db.backtestResults.create(r);
    await get().loadCached(r.strategy_id);
  },

  async loadCached(strategyId) {
    const list = (await window.claw.db.backtestResults.list({
      strategy_id: strategyId,
    })) as BacktestResultRecord[];
    set({ cached: list });
  },

  reset() {
    set({ phase: 'idle', taskId: null, progress: null, result: null });
  },
}));
