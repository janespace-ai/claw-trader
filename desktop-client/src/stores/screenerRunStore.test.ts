import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useScreenerRunStore } from './screenerRunStore';

vi.mock('@/services/remote/contract-client', () => {
  const calls: Array<{ op: string }> = [];
  let resultPayload: unknown = {
    results: [
      { symbol: 'BTC_USDT', passed: true, score: 0.9, rank: 1 },
      { symbol: 'ETH_USDT', passed: false, score: 0.2 },
    ],
  };
  return {
    __calls: calls,
    __setResult: (r: unknown) => {
      resultPayload = r;
    },
    cremote: {
      async startScreener(_body: unknown) {
        calls.push({ op: 'startScreener' });
        return { task_id: 'TASK-S1', status: 'running', started_at: 1 };
      },
      async getScreenerResult(_p: unknown) {
        return {
          task_id: 'TASK-S1',
          status: 'done',
          started_at: 1,
          result: resultPayload,
        };
      },
    },
    toErrorBody() {
      return { code: 'INTERNAL_ERROR', message: 'mock' };
    },
  };
});

function reset() {
  useScreenerRunStore.getState().clear();
}

describe('screenerRunStore', () => {
  beforeEach(reset);

  it('run() populates results + auto-focuses first passed symbol', async () => {
    await useScreenerRunStore.getState().run({ code: 'x' });
    const s = useScreenerRunStore.getState();
    expect(s.status).toBe('complete');
    expect(s.results.length).toBe(2);
    expect(s.focusedSymbol).toBe('BTC_USDT');
  });

  it('focus() sets focusedSymbol', () => {
    useScreenerRunStore.getState().focus('ETH_USDT');
    expect(useScreenerRunStore.getState().focusedSymbol).toBe('ETH_USDT');
  });

  it('seed() populates without a backend round-trip', () => {
    useScreenerRunStore.getState().seed({
      results: [{ symbol: 'LINK_USDT', passed: true, score: 1 }],
      focusedSymbol: 'LINK_USDT',
    });
    const s = useScreenerRunStore.getState();
    expect(s.status).toBe('complete');
    expect(s.results[0].symbol).toBe('LINK_USDT');
  });

  it('does not re-run while one run is in flight', async () => {
    const { __calls } = (await import('@/services/remote/contract-client')) as unknown as {
      __calls: Array<{ op: string }>;
    };
    __calls.length = 0;
    const p1 = useScreenerRunStore.getState().run({ code: 'x' });
    await useScreenerRunStore.getState().run({ code: 'x' });
    await p1;
    expect(__calls.filter((c) => c.op === 'startScreener').length).toBe(1);
  });

  it('clear() resets everything', async () => {
    await useScreenerRunStore.getState().run({ code: 'x' });
    useScreenerRunStore.getState().clear();
    const s = useScreenerRunStore.getState();
    expect(s.status).toBe('idle');
    expect(s.results).toEqual([]);
    expect(s.focusedSymbol).toBeNull();
  });
});
