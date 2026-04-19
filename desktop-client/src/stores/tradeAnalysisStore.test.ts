import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTradeAnalysisStore } from './tradeAnalysisStore';

const calls: Array<{ op: string; args: unknown[] }> = [];
let nextResult: unknown = {
  trade_id: 'T1',
  narrative: 'Went long on RSI cross',
  entry_context: { indicators: { rsi: 32.5 }, regime: 'trend' },
  exit_context: { reason: 'take_profit' },
};
let shouldThrow = false;

vi.mock('@/services/remote/contract-client', () => ({
  cremote: {
    async explainTrade(body: { backtest_task_id: string; symbol: string; trade_id: string }) {
      calls.push({ op: 'explainTrade', args: [body] });
      if (shouldThrow) throw { body: { code: 'INTERNAL_ERROR', message: 'boom' } };
      return nextResult;
    },
  },
  toErrorBody: (e: unknown) => {
    if (e && typeof e === 'object' && 'body' in (e as object)) {
      return (e as { body: { code: string; message: string } }).body;
    }
    return { code: 'INTERNAL_ERROR', message: String(e) };
  },
}));

beforeEach(() => {
  calls.length = 0;
  shouldThrow = false;
  useTradeAnalysisStore.setState({ byTradeId: {} });
});

describe('tradeAnalysisStore', () => {
  it('loadForTrade populates entry with complete status', async () => {
    await useTradeAnalysisStore.getState().loadForTrade({
      backtest_task_id: 'BT1',
      symbol: 'BTC_USDT',
      trade_id: 'T1',
    });
    const e = useTradeAnalysisStore.getState().byTradeId['T1'];
    expect(e.status).toBe('complete');
    expect(e.result?.narrative).toContain('long');
  });

  it('is idempotent when already complete', async () => {
    await useTradeAnalysisStore.getState().loadForTrade({
      backtest_task_id: 'BT1',
      symbol: 'BTC_USDT',
      trade_id: 'T1',
    });
    await useTradeAnalysisStore.getState().loadForTrade({
      backtest_task_id: 'BT1',
      symbol: 'BTC_USDT',
      trade_id: 'T1',
    });
    expect(calls.filter((c) => c.op === 'explainTrade').length).toBe(1);
  });

  it('records failed status with error message', async () => {
    shouldThrow = true;
    await useTradeAnalysisStore.getState().loadForTrade({
      backtest_task_id: 'BT1',
      symbol: 'BTC_USDT',
      trade_id: 'T2',
    });
    const e = useTradeAnalysisStore.getState().byTradeId['T2'];
    expect(e.status).toBe('failed');
    expect(e.error).toMatch(/boom/);
  });

  it('clear() empties the cache', async () => {
    await useTradeAnalysisStore.getState().loadForTrade({
      backtest_task_id: 'BT1',
      symbol: 'BTC_USDT',
      trade_id: 'T1',
    });
    useTradeAnalysisStore.getState().clear();
    expect(useTradeAnalysisStore.getState().byTradeId).toEqual({});
  });
});
