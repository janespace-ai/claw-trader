import { create } from 'zustand';
import { cremote, toErrorBody } from '@/services/remote/contract-client';
import type { components } from '@/types/api';

type SignalVerdict = components['schemas']['SignalVerdict'];
type SignalSummary = components['schemas']['SignalReviewResult']['summary'];

/**
 * Tracks the in-flight Signal Review for the currently focused
 * Preview Backtest. Keyed by `backtestTaskId` so switching previews
 * doesn't wipe an earlier review; we just display the current one.
 *
 * 404 handling: if the backend hasn't shipped Signal Review yet,
 * `startSignalReview` returns a 404. We mark that taskId as
 * `unavailable` and surface a muted banner instead of an error — the
 * screen still renders with the backend-produced trades/metrics.
 */

export type ReviewStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'complete'
  | 'failed'
  | 'unavailable';

export interface ReviewEntry {
  status: ReviewStatus;
  /** Review task id (separate from backtest task id). */
  reviewTaskId: string | null;
  verdicts: SignalVerdict[];
  summary: SignalSummary;
  error: string | null;
  /** `signal_id` of the verdict the user most recently clicked. */
  selectedSignalId: string | null;
  /** Same but from the chart side — ephemeral pulse highlight key. */
  pulseSignalId: string | null;
}

interface SignalReviewState {
  byBacktestTask: Record<string, ReviewEntry>;

  start: (backtestTaskId: string) => Promise<void>;
  selectVerdict: (backtestTaskId: string, signalId: string | null) => void;
  pulseSignal: (backtestTaskId: string, signalId: string | null) => void;
  clear: (backtestTaskId: string) => void;
}

function emptyEntry(): ReviewEntry {
  return {
    status: 'idle',
    reviewTaskId: null,
    verdicts: [],
    summary: {},
    error: null,
    selectedSignalId: null,
    pulseSignalId: null,
  };
}

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 120_000; // 2 min max poll

const activePolls: Record<string, AbortController> = {};

/**
 * A failure to start Signal Review is treated as "backend not available
 * yet" rather than an error when the HTTP layer surfaces a 404-ish
 * signal. We heuristically detect this via the message since
 * `ErrorCode` enum doesn't carry `NOT_FOUND` as a first-class value;
 * the backend emits either `TASK_NOT_FOUND` on a known path or a
 * message containing "404"/"not found" when the route itself is unknown.
 */
function isUnavailableError(body: { code: string; message: string }): boolean {
  if (body.code === 'TASK_NOT_FOUND') return true;
  if (body.code === 'BACKTEST_NOT_FOUND') return true;
  const m = body.message.toLowerCase();
  return m.includes('404') || m.includes('not found');
}

export const useSignalReviewStore = create<SignalReviewState>((set, get) => ({
  byBacktestTask: {},

  async start(backtestTaskId) {
    const existing = get().byBacktestTask[backtestTaskId];
    if (existing && existing.status !== 'idle' && existing.status !== 'failed') {
      // Already started (pending/running/complete/unavailable) — no-op.
      return;
    }

    set((prev) => ({
      byBacktestTask: {
        ...prev.byBacktestTask,
        [backtestTaskId]: { ...emptyEntry(), status: 'pending' },
      },
    }));

    try {
      const task = await cremote.startSignalReview({ backtest_task_id: backtestTaskId });
      set((prev) => ({
        byBacktestTask: {
          ...prev.byBacktestTask,
          [backtestTaskId]: {
            ...(prev.byBacktestTask[backtestTaskId] ?? emptyEntry()),
            status: 'running',
            reviewTaskId: task.task_id,
          },
        },
      }));
      void pollLoop(backtestTaskId, task.task_id, set, get);
    } catch (err) {
      const body = toErrorBody(err);
      // Signal Review is optional (backend endpoint is new). Any error
      // at start-time maps to `unavailable` so the screen still renders
      // trades/metrics with a muted banner. Hard `failed` state is
      // reserved for poll-time failures that started successfully.
      const unavailable = isUnavailableError(body);
      set((prev) => ({
        byBacktestTask: {
          ...prev.byBacktestTask,
          [backtestTaskId]: {
            ...(prev.byBacktestTask[backtestTaskId] ?? emptyEntry()),
            status: unavailable ? 'unavailable' : 'failed',
            error: unavailable ? null : `${body.code}: ${body.message}`,
          },
        },
      }));
    }
  },

  selectVerdict(backtestTaskId, signalId) {
    set((prev) => {
      const cur = prev.byBacktestTask[backtestTaskId];
      if (!cur) return prev;
      return {
        byBacktestTask: {
          ...prev.byBacktestTask,
          [backtestTaskId]: { ...cur, selectedSignalId: signalId },
        },
      };
    });
  },

  pulseSignal(backtestTaskId, signalId) {
    set((prev) => {
      const cur = prev.byBacktestTask[backtestTaskId];
      if (!cur) return prev;
      return {
        byBacktestTask: {
          ...prev.byBacktestTask,
          [backtestTaskId]: { ...cur, pulseSignalId: signalId },
        },
      };
    });
  },

  clear(backtestTaskId) {
    activePolls[backtestTaskId]?.abort();
    delete activePolls[backtestTaskId];
    set((prev) => {
      const next = { ...prev.byBacktestTask };
      delete next[backtestTaskId];
      return { byBacktestTask: next };
    });
  },
}));

async function pollLoop(
  backtestTaskId: string,
  reviewTaskId: string,
  set: (partial: Partial<SignalReviewState> | ((prev: SignalReviewState) => Partial<SignalReviewState>)) => void,
  get: () => SignalReviewState,
) {
  activePolls[backtestTaskId]?.abort();
  const abort = new AbortController();
  activePolls[backtestTaskId] = abort;

  const startedAt = Date.now();
  while (!abort.signal.aborted) {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      set((prev) => ({
        byBacktestTask: {
          ...prev.byBacktestTask,
          [backtestTaskId]: {
            ...(prev.byBacktestTask[backtestTaskId] ?? emptyEntry()),
            status: 'failed',
            error: 'Signal Review poll timed out',
          },
        },
      }));
      return;
    }

    try {
      const res = await cremote.getSignalReviewResult({ task_id: reviewTaskId });
      if (res.status === 'done' && res.result) {
        set((prev) => ({
          byBacktestTask: {
            ...prev.byBacktestTask,
            [backtestTaskId]: {
              ...(prev.byBacktestTask[backtestTaskId] ?? emptyEntry()),
              status: 'complete',
              verdicts: res.result!.verdicts,
              summary: res.result!.summary,
            },
          },
        }));
        return;
      }
      if (res.status === 'failed') {
        set((prev) => ({
          byBacktestTask: {
            ...prev.byBacktestTask,
            [backtestTaskId]: {
              ...(prev.byBacktestTask[backtestTaskId] ?? emptyEntry()),
              status: 'failed',
              error: 'Review task failed',
            },
          },
        }));
        return;
      }
    } catch (err) {
      const body = toErrorBody(err);
      if (isUnavailableError(body)) {
        // The review task disappeared — treat as unavailable.
        set((prev) => ({
          byBacktestTask: {
            ...prev.byBacktestTask,
            [backtestTaskId]: {
              ...(prev.byBacktestTask[backtestTaskId] ?? emptyEntry()),
              status: 'unavailable',
            },
          },
        }));
        return;
      }
      // Transient error — keep polling. (Don't spam console.)
    }

    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    // Re-read latest state; if someone cleared this task, bail.
    if (!get().byBacktestTask[backtestTaskId]) return;
  }
}
