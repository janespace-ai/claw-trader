import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useOptimLensStore } from './optimlensStore';

vi.mock('@/services/remote/contract-client', () => {
  const calls: Array<{ op: string; arg: unknown }> = [];
  return {
    __calls: calls,
    cremote: {
      async startOptimLens(body: unknown) {
        calls.push({ op: 'startOptimLens', arg: body });
        return { task_id: 'OPTIM-1', status: 'running', started_at: 1 };
      },
      async getOptimLensResult(_params: unknown) {
        return {
          task_id: 'OPTIM-1',
          status: 'done',
          started_at: 1,
          result: {
            improvements: [
              {
                title: 'Tighten stop loss',
                category: 'risk_mgmt' as const,
                rationale: 'large losers dominate',
                expected_delta: { sharpe: 0.3, max_drawdown: -0.02 },
                suggested_change: {
                  kind: 'param_update' as const,
                  payload: { param_name: 'stop_loss', current: 0.05, suggested: 0.03 },
                },
              },
              {
                title: 'Filter low-volume entries',
                category: 'filter' as const,
                rationale: 'false signals on thin vol',
              },
            ],
          },
        };
      },
    },
    toErrorBody(e: unknown) {
      if (e && typeof e === 'object' && 'body' in (e as object)) {
        return (e as { body: { code: string; message: string } }).body;
      }
      return { code: 'INTERNAL_ERROR', message: String(e) };
    },
  };
});

function reset() {
  useOptimLensStore.setState({ byStrategy: {} });
}

describe('optimlensStore', () => {
  beforeEach(reset);

  it('start → running → complete populates improvements', async () => {
    await useOptimLensStore.getState().start('S1', {
      strategy_id: 'S1',
      symbols: ['BTC_USDT'],
      param_grid: { a: [1, 2] },
    });
    await vi.waitFor(() => {
      expect(useOptimLensStore.getState().byStrategy['S1']?.status).toBe('complete');
    }, 1000);
    const e = useOptimLensStore.getState().byStrategy['S1'];
    expect(e.improvements.length).toBe(2);
  });

  it('is idempotent while running', async () => {
    const { __calls } = (await import('@/services/remote/contract-client')) as unknown as {
      __calls: Array<{ op: string }>;
    };
    __calls.length = 0;
    await useOptimLensStore.getState().start('S1', {
      strategy_id: 'S1',
      symbols: [],
      param_grid: {},
    });
    await useOptimLensStore.getState().start('S1', {
      strategy_id: 'S1',
      symbols: [],
      param_grid: {},
    });
    const starts = __calls.filter((c) => c.op === 'startOptimLens');
    expect(starts.length).toBe(1);
  });

  it('dismiss + undismiss update dismissed set without losing improvements', async () => {
    await useOptimLensStore.getState().start('S1', {
      strategy_id: 'S1',
      symbols: [],
      param_grid: {},
    });
    await vi.waitFor(() => {
      expect(useOptimLensStore.getState().byStrategy['S1']?.status).toBe('complete');
    }, 1000);
    useOptimLensStore.getState().dismiss('S1', 'Tighten stop loss');
    expect(useOptimLensStore.getState().byStrategy['S1'].dismissed.has('Tighten stop loss')).toBe(true);
    useOptimLensStore.getState().undismiss('S1', 'Tighten stop loss');
    expect(useOptimLensStore.getState().byStrategy['S1'].dismissed.has('Tighten stop loss')).toBe(false);
  });

  it('clear removes the entry', async () => {
    await useOptimLensStore.getState().start('S1', {
      strategy_id: 'S1',
      symbols: [],
      param_grid: {},
    });
    useOptimLensStore.getState().clear('S1');
    expect(useOptimLensStore.getState().byStrategy['S1']).toBeUndefined();
  });
});
