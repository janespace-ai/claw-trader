// Renderer-side remote API wrapper. Delegates to main via IPC.

import type { BacktestConfig } from '@/types/domain';
import { toRawMessage } from '@/services/errors/friendly';

export const remote = {
  setBaseURL: (url: string) => window.claw.remote.setBaseURL(url),
  health: () => window.claw.remote.health(),

  async startBacktest(payload: {
    code: string;
    config: BacktestConfig;
    strategy_id?: string;
    mode?: 'single' | 'optimization';
  }): Promise<{ task_id: string; status: string; mode: string }> {
    return window.claw.remote.backtest.start(payload) as Promise<any>;
  },

  async backtestStatus(taskId: string): Promise<any> {
    return window.claw.remote.backtest.status(taskId);
  },

  async backtestResult(taskId: string): Promise<any> {
    return window.claw.remote.backtest.result(taskId);
  },

  async backtestHistory(strategyId?: string, limit?: number): Promise<any[]> {
    return window.claw.remote.backtest.history(strategyId, limit) as Promise<any[]>;
  },

  async startScreener(payload: {
    code: string;
    config: { market?: string; lookback_days?: number };
    strategy_id?: string;
  }): Promise<{ task_id: string; status: string }> {
    return window.claw.remote.screener.start(payload) as Promise<any>;
  },

  async screenerResult(taskId: string): Promise<any> {
    return window.claw.remote.screener.result(taskId);
  },
};

/** Poll a backtest status endpoint at `intervalMs` until it hits 'done' or 'failed'. */
export async function pollBacktestResult(
  taskId: string,
  onProgress: (status: any) => void,
  opts: { intervalMs?: number; signal?: AbortSignal } = {},
): Promise<any> {
  const interval = opts.intervalMs ?? 3000;
  while (true) {
    if (opts.signal?.aborted) throw new Error('aborted');
    const status = await remote.backtestStatus(taskId);
    onProgress(status);
    if (status.status === 'done') return remote.backtestResult(taskId);
    if (status.status === 'failed') {
      // `status.error` can be a plain string OR the canonical backend
      // `{code, message}` body. `new Error(obj)` would coerce the
      // object to "[object Object]" — normalize to a readable string
      // first so the downstream FriendlyError mapper can classify it
      // (docker / network / user_code / ...).
      throw new Error(toRawMessage(status.error) || 'backtest failed');
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}
