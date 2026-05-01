import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStrategySessionStore, type WorkspaceStrategy } from './strategySessionStore';

// Mock the contract client so we don't hit real fetch.
vi.mock('@/services/remote/contract-client', () => ({
  cremote: {
    getStrategy: vi.fn(),
    createStrategy: vi.fn(),
    patchStrategyDraft: vi.fn(),
    saveStrategy: vi.fn(),
    archiveStrategyDraft: vi.fn(),
  },
}));

import { cremote } from '@/services/remote/contract-client';
const mock = cremote as unknown as {
  getStrategy: ReturnType<typeof vi.fn>;
  createStrategy: ReturnType<typeof vi.fn>;
  patchStrategyDraft: ReturnType<typeof vi.fn>;
  saveStrategy: ReturnType<typeof vi.fn>;
  archiveStrategyDraft: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  // Reset zustand store
  useStrategySessionStore.getState().reset();
  // Reset all mocks
  Object.values(mock).forEach((fn) => fn.mockReset?.());
  // Provide a no-op chat persistence layer for tests that don't care
  (globalThis as unknown as { window: { claw?: unknown } }).window = {
    claw: {
      db: {
        strategyChats: {
          insert: vi.fn().mockResolvedValue({ msg_idx: 0 }),
          list: vi.fn().mockResolvedValue([]),
        },
      },
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
});

function fixture(overrides: Partial<WorkspaceStrategy> = {}): WorkspaceStrategy {
  return {
    id: 's-1',
    name: '未命名',
    code_type: 'strategy',
    code: '',
    current_version: 1,
    created_at: 1700000000,
    updated_at: 1700000000,
    draft_code: null,
    draft_symbols: null,
    saved_code: null,
    saved_symbols: null,
    saved_at: null,
    last_backtest: null,
    is_archived_draft: false,
    ...overrides,
  };
}

describe('strategySessionStore — state machine derivation', () => {
  it('S0 when no strategy loaded', () => {
    expect(useStrategySessionStore.getState().currentState()).toBe('S0');
  });

  it('S0 when strategy has neither draft_code nor draft_symbols', () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture(),
    });
    expect(useStrategySessionStore.getState().currentState()).toBe('S0');
  });

  it('S1a when draft_code present, draft_symbols empty', () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture({
        draft_code: 'class S(Strategy): pass',
        draft_symbols: [],
      }),
    });
    expect(useStrategySessionStore.getState().currentState()).toBe('S1a');
  });

  it('S1b when draft_symbols present, draft_code empty', () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture({
        draft_code: '',
        draft_symbols: ['BTC/USDT'],
      }),
    });
    expect(useStrategySessionStore.getState().currentState()).toBe('S1b');
  });

  it('S2 when both halves present and auto-backtest not yet fired', () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture({
        draft_code: 'x',
        draft_symbols: ['A'],
      }),
      autoBacktestDoneForCurrentPair: false,
    });
    expect(useStrategySessionStore.getState().currentState()).toBe('S2');
  });

  it('S3 when both halves + last_backtest available', () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture({
        draft_code: 'x',
        draft_symbols: ['A'],
        last_backtest: { task_id: 't1', summary: { pnl: 12 }, ran_at: 1 },
      }),
      autoBacktestDoneForCurrentPair: true,
    });
    expect(useStrategySessionStore.getState().currentState()).toBe('S3');
  });

  it('S5 takes precedence when param sweep is in flight', () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture({
        draft_code: 'x',
        draft_symbols: ['A'],
        last_backtest: { task_id: 't1', summary: {}, ran_at: 1 },
      }),
      paramSweepInFlight: true,
    });
    expect(useStrategySessionStore.getState().currentState()).toBe('S5');
  });
});

describe('strategySessionStore — hasWorkspaceChanges + isCommitted', () => {
  it('hasWorkspaceChanges false when draft equals saved', () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture({
        draft_code: 'x',
        saved_code: 'x',
        draft_symbols: ['A'],
        saved_symbols: ['A'],
      }),
    });
    expect(useStrategySessionStore.getState().hasWorkspaceChanges()).toBe(false);
  });

  it('hasWorkspaceChanges true when draft_code differs from saved_code', () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture({
        draft_code: 'x v2',
        saved_code: 'x',
        draft_symbols: ['A'],
        saved_symbols: ['A'],
      }),
    });
    expect(useStrategySessionStore.getState().hasWorkspaceChanges()).toBe(true);
  });

  it('isCommitted true when saved_at set', () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture({ saved_at: 1700000100 }),
    });
    expect(useStrategySessionStore.getState().isCommitted()).toBe(true);
  });
});

describe('strategySessionStore — first-message-creates-strategy', () => {
  it('createStrategy POSTs to backend and re-hydrates', async () => {
    mock.createStrategy.mockResolvedValue({ id: 's-new', name: '未命名' });
    mock.getStrategy.mockResolvedValue(fixture({ id: 's-new', name: '未命名' }));

    const id = await useStrategySessionStore.getState().createStrategy();
    expect(id).toBe('s-new');
    expect(mock.createStrategy).toHaveBeenCalledOnce();
    expect(mock.getStrategy).toHaveBeenCalledWith({ id: 's-new' });
    expect(useStrategySessionStore.getState().strategyId).toBe('s-new');
  });

  it('appendMessage throws when no active strategy', async () => {
    await expect(
      useStrategySessionStore.getState().appendMessage('user', 'hi'),
    ).rejects.toThrow(/no active strategy|without an active strategy/);
  });

  it('appendMessage with active strategy persists + appends to messages', async () => {
    useStrategySessionStore.setState({ strategyId: 's-1' });
    await useStrategySessionStore.getState().appendMessage('user', 'first msg');
    const msgs = useStrategySessionStore.getState().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ role: 'user', content: 'first msg' });
  });
});

describe('strategySessionStore — saveStrategy + archiveCurrentDraftAndOpenNew', () => {
  it('saveStrategy snapshots draft → saved_*', async () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture({ draft_code: 'v2', draft_symbols: ['BTC'] }),
    });
    mock.saveStrategy.mockResolvedValue(
      fixture({
        draft_code: 'v2',
        draft_symbols: ['BTC'],
        saved_code: 'v2',
        saved_symbols: ['BTC'],
        saved_at: 1700000999,
      }),
    );
    await useStrategySessionStore.getState().saveStrategy('My Strategy');
    expect(mock.saveStrategy).toHaveBeenCalledWith({ id: 's-1', name: 'My Strategy' });
    expect(useStrategySessionStore.getState().strategy?.saved_code).toBe('v2');
    expect(useStrategySessionStore.getState().isCommitted()).toBe(true);
  });

  it('archiveCurrentDraftAndOpenNew calls archive endpoint when dirty + resets', async () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture({ draft_code: 'v2', saved_code: 'v1' }), // dirty
    });
    mock.archiveStrategyDraft.mockResolvedValue({ id: 's-1', is_archived_draft: true });
    await useStrategySessionStore.getState().archiveCurrentDraftAndOpenNew();
    expect(mock.archiveStrategyDraft).toHaveBeenCalledWith({ id: 's-1' });
    expect(useStrategySessionStore.getState().strategyId).toBeNull();
    expect(useStrategySessionStore.getState().strategy).toBeNull();
  });

  it('archiveCurrentDraftAndOpenNew SKIPS archive when not dirty + just resets', async () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture({ draft_code: 'v1', saved_code: 'v1' }), // clean
    });
    await useStrategySessionStore.getState().archiveCurrentDraftAndOpenNew();
    expect(mock.archiveStrategyDraft).not.toHaveBeenCalled();
    expect(useStrategySessionStore.getState().strategyId).toBeNull();
  });
});

describe('strategySessionStore — auto-backtest trigger', () => {
  it('does NOT fire when only one half is present', async () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture({ draft_code: 'x', draft_symbols: [] }),
    });
    const run = vi.fn().mockResolvedValue(undefined);
    await useStrategySessionStore.getState().maybeFireAutoBacktest(run);
    expect(run).not.toHaveBeenCalled();
  });

  it('fires once when both halves present + auto_backtest_done=false', async () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture({ draft_code: 'x', draft_symbols: ['A'] }),
      autoBacktestDoneForCurrentPair: false,
      lastAutoBacktestAt: 0,
    });
    const run = vi.fn().mockResolvedValue(undefined);
    await useStrategySessionStore.getState().maybeFireAutoBacktest(run);
    expect(run).toHaveBeenCalledOnce();
    expect(useStrategySessionStore.getState().autoBacktestDoneForCurrentPair).toBe(true);
  });

  it('does NOT fire a second time once already fired', async () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture({ draft_code: 'x', draft_symbols: ['A'] }),
      autoBacktestDoneForCurrentPair: true,
    });
    const run = vi.fn().mockResolvedValue(undefined);
    await useStrategySessionStore.getState().maybeFireAutoBacktest(run);
    expect(run).not.toHaveBeenCalled();
  });

  it('rate-limits — does NOT fire if last fire was within 60s', async () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture({ draft_code: 'x', draft_symbols: ['A'] }),
      autoBacktestDoneForCurrentPair: false,
      lastAutoBacktestAt: Date.now() - 10_000, // 10s ago
    });
    const run = vi.fn().mockResolvedValue(undefined);
    await useStrategySessionStore.getState().maybeFireAutoBacktest(run);
    expect(run).not.toHaveBeenCalled();
  });
});
