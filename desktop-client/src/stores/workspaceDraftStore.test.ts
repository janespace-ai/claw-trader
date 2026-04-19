import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceDraftStore } from './workspaceDraftStore';

function reset() {
  useWorkspaceDraftStore.getState().clear();
}

describe('workspaceDraftStore', () => {
  beforeEach(reset);

  it('captures summary + code on setDraft and seeds params from summary', () => {
    useWorkspaceDraftStore.getState().setDraft({
      strategyId: 'S1',
      version: 2,
      summary: {
        name: 'Momentum',
        interval: '1h',
        params: { ema_fast: 20, ema_slow: 50, label: 'fast' },
      },
      code: 'def strategy(): pass',
    });

    const s = useWorkspaceDraftStore.getState();
    expect(s.strategyId).toBe('S1');
    expect(s.version).toBe(2);
    expect(s.name).toBe('Momentum');
    expect(s.code).toBe('def strategy(): pass');
    expect(s.params).toEqual({ ema_fast: 20, ema_slow: 50, label: 'fast' });
  });

  it('filters out non-scalar param values', () => {
    useWorkspaceDraftStore.getState().setDraft({
      summary: {
        name: 'S',
        params: { good: 5, bad: { nested: true } as unknown as number },
      },
      code: 'pass',
    });
    expect(useWorkspaceDraftStore.getState().params).toEqual({ good: 5 });
  });

  it('updateParam mutates a single param without affecting others', () => {
    useWorkspaceDraftStore.getState().setDraft({
      summary: { name: 'S', params: { a: 1, b: 2 } },
      code: 'x',
    });
    useWorkspaceDraftStore.getState().updateParam('a', 99);
    expect(useWorkspaceDraftStore.getState().params).toEqual({ a: 99, b: 2 });
  });

  it('clear resets all fields', () => {
    useWorkspaceDraftStore.getState().setDraft({
      strategyId: 'S',
      summary: { name: 'N' },
      code: 'c',
    });
    useWorkspaceDraftStore.getState().clear();
    const s = useWorkspaceDraftStore.getState();
    expect(s.strategyId).toBeNull();
    expect(s.code).toBeNull();
    expect(s.summary).toBeNull();
    expect(s.params).toEqual({});
    expect(s.name).toBe('');
  });
});
