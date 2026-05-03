import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from './appStore';
import { useStrategySessionStore } from './strategySessionStore';

vi.mock('@/services/remote/contract-client', () => ({
  cremote: {
    getStrategy: vi.fn(),
    createStrategy: vi.fn(),
  },
  toErrorBody: (e: unknown) => e,
}));

import { cremote } from '@/services/remote/contract-client';

beforeEach(() => {
  useAppStore.setState({ focusedSymbol: null });
  useStrategySessionStore.getState().reset();
  vi.clearAllMocks();
});

afterEach(() => {
  useAppStore.setState({ focusedSymbol: null });
});

describe('focusedSymbol — workspace-three-zone-layout mutex', () => {
  it('setFocusedSymbol updates appStore', () => {
    useAppStore.getState().setFocusedSymbol('ETH_USDT');
    expect(useAppStore.getState().focusedSymbol).toBe('ETH_USDT');
  });

  it('loadStrategy initializes focusedSymbol from draft_symbols[0]', async () => {
    (cremote.getStrategy as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 's-1',
      name: 'X',
      code_type: 'strategy',
      code: '',
      current_version: 1,
      draft_symbols: ['SOL_USDT', 'XRP_USDT'],
      draft_code: null,
      saved_code: null,
      saved_symbols: null,
      saved_at: null,
      last_backtest: undefined,
      is_archived_draft: false,
      created_at: 0,
      updated_at: 0,
    });
    await useStrategySessionStore.getState().loadStrategy('s-1');
    expect(useAppStore.getState().focusedSymbol).toBe('SOL_USDT');
  });

  it('loadStrategy defaults focusedSymbol to BTC_USDT when draft_symbols is empty', async () => {
    (cremote.getStrategy as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 's-2',
      name: 'X',
      code_type: 'strategy',
      code: '',
      current_version: 1,
      draft_symbols: [],
      draft_code: null,
      saved_code: null,
      saved_symbols: null,
      saved_at: null,
      last_backtest: undefined,
      is_archived_draft: false,
      created_at: 0,
      updated_at: 0,
    });
    await useStrategySessionStore.getState().loadStrategy('s-2');
    expect(useAppStore.getState().focusedSymbol).toBe('BTC_USDT');
  });

  it('loadStrategy does NOT override an existing focusedSymbol', async () => {
    useAppStore.getState().setFocusedSymbol('DOGE_USDT');
    (cremote.getStrategy as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 's-3',
      name: 'X',
      code_type: 'strategy',
      code: '',
      current_version: 1,
      draft_symbols: ['BTC_USDT'],
      draft_code: null,
      saved_code: null,
      saved_symbols: null,
      saved_at: null,
      last_backtest: undefined,
      is_archived_draft: false,
      created_at: 0,
      updated_at: 0,
    });
    await useStrategySessionStore.getState().loadStrategy('s-3');
    expect(useAppStore.getState().focusedSymbol).toBe('DOGE_USDT');
  });
});
