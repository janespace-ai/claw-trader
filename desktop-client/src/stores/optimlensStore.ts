import { create } from 'zustand';
import { cremote, toErrorBody } from '@/services/remote/contract-client';
import type { components } from '@/types/api';

type OptimLensRequest = components['schemas']['OptimLensRequest'];
type OptimLensResult = components['schemas']['OptimLensResult'];
type OptimLensImprovement = components['schemas']['OptimLensImprovement'];

export type OptimStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'complete'
  | 'failed'
  | 'unavailable';

export interface OptimEntry {
  status: OptimStatus;
  taskId: string | null;
  improvements: OptimLensImprovement[];
  baseMetrics: OptimLensResult['base_metrics'];
  /** `title`s (or index-stringified) the user has dismissed. */
  dismissed: Set<string>;
  error: string | null;
}

interface OptimLensState {
  byStrategy: Record<string, OptimEntry>;

  start: (strategyId: string, req: OptimLensRequest) => Promise<void>;
  dismiss: (strategyId: string, key: string) => void;
  undismiss: (strategyId: string, key: string) => void;
  clear: (strategyId: string) => void;
}

function empty(): OptimEntry {
  return {
    status: 'idle',
    taskId: null,
    improvements: [],
    baseMetrics: undefined,
    dismissed: new Set(),
    error: null,
  };
}

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 5 * 60_000;
const activePolls: Record<string, AbortController> = {};

function isUnavailable(body: { code: string; message: string }): boolean {
  if (body.code === 'STRATEGY_NOT_FOUND') return false;
  if (body.code === 'PARAM_GRID_TOO_LARGE') return false;
  const m = body.message.toLowerCase();
  return m.includes('404') || m.includes('not found');
}

export const useOptimLensStore = create<OptimLensState>((set, get) => ({
  byStrategy: {},

  async start(strategyId, req) {
    const cur = get().byStrategy[strategyId];
    // Idempotent: only restart from an `idle` or `failed` entry. `complete`
    // stays until the user explicitly re-runs via clear() + start().
    if (cur && cur.status !== 'idle' && cur.status !== 'failed') return;

    set((prev) => ({
      byStrategy: {
        ...prev.byStrategy,
        [strategyId]: { ...empty(), status: 'pending' },
      },
    }));

    try {
      const task = await cremote.startOptimLens(req);
      set((prev) => ({
        byStrategy: {
          ...prev.byStrategy,
          [strategyId]: {
            ...(prev.byStrategy[strategyId] ?? empty()),
            status: 'running',
            taskId: task.task_id,
          },
        },
      }));
      void poll(strategyId, task.task_id, set, get);
    } catch (err) {
      const body = toErrorBody(err);
      const unavailable = isUnavailable(body);
      set((prev) => ({
        byStrategy: {
          ...prev.byStrategy,
          [strategyId]: {
            ...(prev.byStrategy[strategyId] ?? empty()),
            status: unavailable ? 'unavailable' : 'failed',
            error: unavailable ? null : `${body.code}: ${body.message}`,
          },
        },
      }));
    }
  },

  dismiss(strategyId, key) {
    set((prev) => {
      const cur = prev.byStrategy[strategyId];
      if (!cur) return prev;
      const nextDismissed = new Set(cur.dismissed);
      nextDismissed.add(key);
      return {
        byStrategy: {
          ...prev.byStrategy,
          [strategyId]: { ...cur, dismissed: nextDismissed },
        },
      };
    });
  },

  undismiss(strategyId, key) {
    set((prev) => {
      const cur = prev.byStrategy[strategyId];
      if (!cur) return prev;
      const nextDismissed = new Set(cur.dismissed);
      nextDismissed.delete(key);
      return {
        byStrategy: {
          ...prev.byStrategy,
          [strategyId]: { ...cur, dismissed: nextDismissed },
        },
      };
    });
  },

  clear(strategyId) {
    activePolls[strategyId]?.abort();
    delete activePolls[strategyId];
    set((prev) => {
      const next = { ...prev.byStrategy };
      delete next[strategyId];
      return { byStrategy: next };
    });
  },
}));

async function poll(
  strategyId: string,
  taskId: string,
  set: (u: Partial<OptimLensState> | ((p: OptimLensState) => Partial<OptimLensState>)) => void,
  get: () => OptimLensState,
) {
  activePolls[strategyId]?.abort();
  const abort = new AbortController();
  activePolls[strategyId] = abort;
  const startedAt = Date.now();

  while (!abort.signal.aborted) {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      set((prev) => ({
        byStrategy: {
          ...prev.byStrategy,
          [strategyId]: {
            ...(prev.byStrategy[strategyId] ?? empty()),
            status: 'failed',
            error: 'OptimLens poll timed out',
          },
        },
      }));
      return;
    }

    try {
      const res = await cremote.getOptimLensResult({ task_id: taskId });
      if (res.status === 'done' && res.result) {
        set((prev) => ({
          byStrategy: {
            ...prev.byStrategy,
            [strategyId]: {
              ...(prev.byStrategy[strategyId] ?? empty()),
              status: 'complete',
              improvements: res.result!.improvements,
              baseMetrics: res.result!.base_metrics,
            },
          },
        }));
        return;
      }
      if (res.status === 'failed') {
        set((prev) => ({
          byStrategy: {
            ...prev.byStrategy,
            [strategyId]: {
              ...(prev.byStrategy[strategyId] ?? empty()),
              status: 'failed',
              error: 'OptimLens task failed',
            },
          },
        }));
        return;
      }
    } catch (err) {
      const body = toErrorBody(err);
      if (isUnavailable(body)) {
        set((prev) => ({
          byStrategy: {
            ...prev.byStrategy,
            [strategyId]: {
              ...(prev.byStrategy[strategyId] ?? empty()),
              status: 'unavailable',
            },
          },
        }));
        return;
      }
    }
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
    if (!get().byStrategy[strategyId]) return;
  }
}
