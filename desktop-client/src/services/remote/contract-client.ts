// Contract client (`cremote`) — strongly-typed wrapper around the
// existing Electron IPC remote surface (`window.claw.remote.*`), with
// responses normalized into canonical `api/openapi.yaml` shapes via
// `legacy-adapter`.
//
// Call-site migration is opportunistic: new UI code uses `cremote`; old
// code continues to use `remote` from `./client.ts` until each screen is
// migrated. Eventually `./client.ts` + `./legacy-adapter.ts` both go
// away (during `backtest-engine-align-contract`).

import type { components } from '@/types/api';
import { adaptTaskResponse, adaptPaginated, adaptError } from './legacy-adapter';

type Schemas = components['schemas'];
type TaskResponse = Schemas['TaskResponse'];
type Kline = Schemas['Kline'];
type Symbol = Schemas['Symbol'];
type Gap = Schemas['Gap'];
type Strategy = Schemas['Strategy'];
type BacktestHistoryItem = Schemas['BacktestHistoryItem'];
type BacktestConfig = Schemas['BacktestConfig'];
type ScreenerResult = Schemas['ScreenerResult'];
type Paginated<T> = { items: T[]; next_cursor: string | null };

// ---- Internal helpers ------------------------------------------------------

/** The renderer talks to the real backend via window.claw.remote (main
 *  process fetch). Exposed here to keep import graph in one place. */
function iface() {
  const g = globalThis as { claw?: { remote?: any } };
  if (!g.claw?.remote) {
    throw new Error('window.claw.remote is not available');
  }
  return g.claw.remote;
}

// Runtime schema validation warning (dev-only, no throw). We call this
// when responses come back for quick sanity without breaking the app.
function warnIfNotObject(op: string, data: unknown) {
  if (!import.meta.env.DEV) return;
  if (typeof data !== 'object' || data === null) {
    // eslint-disable-next-line no-console
    console.warn(`[cremote] ${op}: expected object, got`, typeof data, data);
  }
}

// ---- API -------------------------------------------------------------------

export const cremote = {
  // Market data --------------------------------------------------------------

  /** Server-side route: `GET /api/klines`. Returns ordered klines. */
  async getKlines(params: {
    symbol: string;
    interval: Schemas['Interval'];
    from?: number;
    to?: number;
    market?: Schemas['Market'];
    limit?: number;
  }): Promise<Kline[]> {
    const res = await iface().fetch('/api/klines', {
      method: 'GET',
      query: params,
    });
    warnIfNotObject('getKlines', res);
    return Array.isArray(res) ? (res as Kline[]) : [];
  },

  /** `GET /api/symbols` — paginated. Legacy returned bare array. */
  async listSymbols(params: {
    market?: Schemas['Market'];
    limit?: number;
    cursor?: string;
  } = {}): Promise<Paginated<Symbol>> {
    const res = await iface().fetch('/api/symbols', { method: 'GET', query: params });
    return adaptPaginated<Symbol>(res);
  },

  /** `GET /api/gaps` */
  async listGaps(params: {
    symbol?: string;
    interval?: Schemas['Interval'];
    status?: string;
  } = {}): Promise<Gap[]> {
    const res = await iface().fetch('/api/gaps', { method: 'GET', query: params });
    return Array.isArray(res) ? (res as Gap[]) : [];
  },

  // Strategies ---------------------------------------------------------------

  async createStrategy(body: {
    name: string;
    code_type: 'strategy' | 'screener';
    code: string;
    params_schema?: Record<string, unknown>;
  }): Promise<{ id: string; name: string }> {
    return iface().fetch('/api/strategies', { method: 'POST', body });
  },

  async listStrategies(params: {
    code_type?: 'strategy' | 'screener';
    limit?: number;
    cursor?: string;
  } = {}): Promise<Paginated<Strategy>> {
    const res = await iface().fetch('/api/strategies', { method: 'GET', query: params });
    return adaptPaginated<Strategy>(res);
  },

  async getStrategy(params: { id: string }): Promise<Strategy> {
    return iface().fetch(`/api/strategies/${encodeURIComponent(params.id)}`, {
      method: 'GET',
    });
  },

  // Backtest -----------------------------------------------------------------

  async startBacktest(body: {
    code: string;
    config: BacktestConfig;
    strategy_id?: string;
  }): Promise<TaskResponse> {
    // Contract drift workaround: `openapi.yaml` declares `from`/`to` as
    // `integer`, but the running Go backend's struct is `string` (see
    // `backtest-engine/internal/model/backtest.go` — it parses Unix
    // seconds, RFC3339, or YYYY-MM-DD from a string). JSON-binding a
    // number therefore fails with `INVALID_RANGE: bind request: Mismatch
    // type string with value number`. Coerce to string on the wire so
    // TS types stay aligned with the spec while runtime matches the
    // actual backend. Remove once backtest-engine lands the int switch.
    const { config } = body;
    const wireBody = {
      ...body,
      config: {
        ...config,
        from: String(config.from),
        to: String(config.to),
      },
    };
    const res = await iface().fetch('/api/backtest/start', { method: 'POST', body: wireBody });
    return adaptTaskResponse(res);
  },

  async getBacktestStatus(params: { task_id: string }): Promise<TaskResponse> {
    const res = await iface().fetch(
      `/api/backtest/status/${encodeURIComponent(params.task_id)}`,
      { method: 'GET' },
    );
    return adaptTaskResponse(res);
  },

  async getBacktestResult(params: { task_id: string }): Promise<TaskResponse> {
    const res = await iface().fetch(
      `/api/backtest/result/${encodeURIComponent(params.task_id)}`,
      { method: 'GET' },
    );
    return adaptTaskResponse(res);
  },

  async listBacktestHistory(params: {
    strategy_id?: string;
    limit?: number;
    cursor?: string;
  } = {}): Promise<Paginated<BacktestHistoryItem>> {
    const res = await iface().fetch('/api/backtest/history', { method: 'GET', query: params });
    return adaptPaginated<BacktestHistoryItem>(res);
  },

  // Screener -----------------------------------------------------------------

  async startScreener(body: {
    code: string;
    config?: { market?: Schemas['Market']; lookback_days?: number };
    strategy_id?: string;
  }): Promise<TaskResponse> {
    const res = await iface().fetch('/api/screener/start', { method: 'POST', body });
    return adaptTaskResponse(res);
  },

  async getScreenerResult(params: { task_id: string }): Promise<
    TaskResponse & { result?: ScreenerResult }
  > {
    const res = await iface().fetch(
      `/api/screener/result/${encodeURIComponent(params.task_id)}`,
      { method: 'GET' },
    );
    return adaptTaskResponse(res) as TaskResponse & { result?: ScreenerResult };
  },

  // ======================================================================
  // New capabilities (api-contract-new-capabilities)
  // ======================================================================

  // --- Symbol metadata ---

  async getSymbolMetadata(params: { symbol: string }): Promise<Schemas['SymbolMetadata']> {
    return iface().fetch(
      `/api/symbols/${encodeURIComponent(params.symbol)}/metadata`,
      { method: 'GET' },
    );
  },

  // --- Strategy versions ---

  async listStrategyVersions(params: {
    strategy_id: string;
    limit?: number;
    cursor?: string;
  }): Promise<Paginated<Schemas['StrategyVersion']>> {
    const res = await iface().fetch(
      `/api/strategies/${encodeURIComponent(params.strategy_id)}/versions`,
      { method: 'GET', query: { limit: params.limit, cursor: params.cursor } },
    );
    return adaptPaginated<Schemas['StrategyVersion']>(res);
  },

  async createStrategyVersion(params: {
    strategy_id: string;
    body: {
      code: string;
      summary?: string;
      params_schema?: Record<string, unknown>;
      parent_version?: number;
    };
  }): Promise<Schemas['StrategyVersion']> {
    return iface().fetch(
      `/api/strategies/${encodeURIComponent(params.strategy_id)}/versions`,
      { method: 'POST', body: params.body },
    );
  },

  async getStrategyVersion(params: {
    strategy_id: string;
    version: number;
  }): Promise<Schemas['StrategyVersion']> {
    return iface().fetch(
      `/api/strategies/${encodeURIComponent(params.strategy_id)}/versions/${params.version}`,
      { method: 'GET' },
    );
  },

  // --- Analysis: OptimLens ---

  async startOptimLens(body: Schemas['OptimLensRequest']): Promise<TaskResponse> {
    const res = await iface().fetch('/api/analysis/optimlens', { method: 'POST', body });
    return adaptTaskResponse(res);
  },

  async getOptimLensResult(params: { task_id: string }): Promise<
    TaskResponse & { result?: Schemas['OptimLensResult'] }
  > {
    const res = await iface().fetch(
      `/api/analysis/optimlens/${encodeURIComponent(params.task_id)}`,
      { method: 'GET' },
    );
    return adaptTaskResponse(res) as TaskResponse & { result?: Schemas['OptimLensResult'] };
  },

  // --- Analysis: SignalReview ---

  async startSignalReview(body: Schemas['SignalReviewRequest']): Promise<TaskResponse> {
    const res = await iface().fetch('/api/analysis/signals', { method: 'POST', body });
    return adaptTaskResponse(res);
  },

  async getSignalReviewResult(params: { task_id: string }): Promise<
    TaskResponse & { result?: Schemas['SignalReviewResult'] }
  > {
    const res = await iface().fetch(
      `/api/analysis/signals/${encodeURIComponent(params.task_id)}`,
      { method: 'GET' },
    );
    return adaptTaskResponse(res) as TaskResponse & {
      result?: Schemas['SignalReviewResult'];
    };
  },

  // --- Analysis: TradeExplain (synchronous) ---

  async explainTrade(
    body: Schemas['TradeExplainRequest'],
  ): Promise<Schemas['TradeExplainResult']> {
    return iface().fetch('/api/analysis/trade', { method: 'POST', body });
  },

  // --- Engine status ---

  async getEngineStatus(): Promise<Schemas['EngineStatus']> {
    return iface().fetch('/api/engine/status', { method: 'GET' });
  },
};

// ---- Error unwrapping ------------------------------------------------------

/** If a call throws because the backend returned a 4xx/5xx, this helper
 *  unwraps to a canonical `ErrorBody`. Callers can `try/catch` and
 *  branch on `error.code`. */
export function toErrorBody(e: unknown): Schemas['ErrorBody'] {
  if (e && typeof e === 'object' && 'body' in (e as object)) {
    return adaptError((e as { body: unknown }).body);
  }
  if (e instanceof Error) {
    return adaptError(e.message);
  }
  return adaptError(e);
}
