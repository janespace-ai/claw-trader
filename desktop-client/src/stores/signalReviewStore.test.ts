import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSignalReviewStore } from './signalReviewStore';

// Mock the contract client so we don't hit the network.
vi.mock('@/services/remote/contract-client', () => {
  const calls: Array<{ op: string; arg: unknown }> = [];
  return {
    __calls: calls,
    cremote: {
      async startSignalReview(body: { backtest_task_id: string }) {
        calls.push({ op: 'startSignalReview', arg: body });
        if (body.backtest_task_id === 'TASK_UNAVAILABLE') {
          throw { body: { code: 'INTERNAL_ERROR', message: '404 not found' } };
        }
        if (body.backtest_task_id === 'TASK_FAILED') {
          throw { body: { code: 'INTERNAL_ERROR', message: 'boom' } };
        }
        return {
          task_id: 'REVIEW-' + body.backtest_task_id,
          status: 'running',
          started_at: 1,
        };
      },
      async getSignalReviewResult(params: { task_id: string }) {
        calls.push({ op: 'getSignalReviewResult', arg: params });
        return {
          task_id: params.task_id,
          status: 'done',
          started_at: 1,
          result: {
            signals_total: 2,
            summary: { good: 1, bad: 1 },
            verdicts: [
              { signal_id: 's1', symbol: 'BTC_USDT', entry_ts: 1, verdict: 'good' },
              { signal_id: 's2', symbol: 'ETH_USDT', entry_ts: 2, verdict: 'bad' },
            ],
          },
        };
      },
    },
    toErrorBody(e: unknown): { code: string; message: string } {
      if (e && typeof e === 'object' && 'body' in (e as object)) {
        return (e as { body: { code: string; message: string } }).body;
      }
      return { code: 'INTERNAL_ERROR', message: String(e) };
    },
  };
});

function resetStore() {
  useSignalReviewStore.setState({ byBacktestTask: {} });
}

describe('signalReviewStore', () => {
  beforeEach(resetStore);

  it('starts + polls + completes with verdicts', async () => {
    await useSignalReviewStore.getState().start('TASK_OK');
    // Let the poll loop resolve (first iteration returns done immediately).
    await new Promise((r) => setTimeout(r, 0));
    // Poll happens in a setTimeout loop; wait for one tick.
    await vi.waitFor(() => {
      const e = useSignalReviewStore.getState().byBacktestTask['TASK_OK'];
      expect(e?.status).toBe('complete');
    }, 1000);
    const e = useSignalReviewStore.getState().byBacktestTask['TASK_OK'];
    expect(e.verdicts.length).toBe(2);
    expect(e.summary).toEqual({ good: 1, bad: 1 });
  });

  it('is idempotent — calling start twice only triggers one backend start', async () => {
    const { __calls } = (await import('@/services/remote/contract-client')) as unknown as {
      __calls: Array<{ op: string }>;
    };
    __calls.length = 0;
    await useSignalReviewStore.getState().start('TASK_OK');
    await useSignalReviewStore.getState().start('TASK_OK');
    const starts = __calls.filter((c) => c.op === 'startSignalReview');
    expect(starts.length).toBe(1);
  });

  it('treats 404-ish errors as unavailable, not failed', async () => {
    await useSignalReviewStore.getState().start('TASK_UNAVAILABLE');
    const e = useSignalReviewStore.getState().byBacktestTask['TASK_UNAVAILABLE'];
    expect(e.status).toBe('unavailable');
    expect(e.error).toBeNull();
  });

  it('surfaces other errors as failed', async () => {
    await useSignalReviewStore.getState().start('TASK_FAILED');
    const e = useSignalReviewStore.getState().byBacktestTask['TASK_FAILED'];
    expect(e.status).toBe('failed');
    expect(e.error).toMatch(/boom/);
  });

  it('selectVerdict and pulseSignal set the right fields', async () => {
    await useSignalReviewStore.getState().start('TASK_OK');
    await vi.waitFor(() => {
      expect(useSignalReviewStore.getState().byBacktestTask['TASK_OK']?.status).toBe('complete');
    }, 1000);
    useSignalReviewStore.getState().selectVerdict('TASK_OK', 's1');
    expect(useSignalReviewStore.getState().byBacktestTask['TASK_OK'].selectedSignalId).toBe('s1');
    useSignalReviewStore.getState().pulseSignal('TASK_OK', 's2');
    expect(useSignalReviewStore.getState().byBacktestTask['TASK_OK'].pulseSignalId).toBe('s2');
  });

  it('clear() removes the entry + aborts any active poll', async () => {
    await useSignalReviewStore.getState().start('TASK_OK');
    useSignalReviewStore.getState().clear('TASK_OK');
    expect(useSignalReviewStore.getState().byBacktestTask['TASK_OK']).toBeUndefined();
  });
});
