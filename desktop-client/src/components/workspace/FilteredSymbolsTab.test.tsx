import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FilteredSymbolsTab } from './FilteredSymbolsTab';
import { useStrategySessionStore } from '@/stores/strategySessionStore';
import { useAppStore } from '@/stores/appStore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, opts?: Record<string, unknown> & { defaultValue?: string }) => {
      const tpl = opts?.defaultValue ?? _k;
      if (!opts) return tpl;
      return tpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(opts[k] ?? ''));
    },
  }),
}));

vi.mock('@/services/remote/contract-client', () => ({
  cremote: {
    patchStrategyDraft: vi.fn(async (args: unknown) => ({
      ...(args as Record<string, unknown>),
      id: 's-1',
      draft_symbols: (args as { draft_symbols?: string[] }).draft_symbols ?? [],
    })),
  },
  toErrorBody: (e: unknown) => e,
}));

const baseStrategy = {
  id: 's-1',
  name: 'X',
  code_type: 'strategy' as const,
  code: '',
  current_version: 1,
  draft_code: null,
  draft_symbols: ['BTC_USDT'],
  saved_code: null,
  saved_symbols: null,
  saved_at: null,
  last_backtest: undefined,
  is_archived_draft: false,
  created_at: 0,
  updated_at: 0,
};

beforeEach(() => {
  useStrategySessionStore.getState().reset();
  useStrategySessionStore.setState({
    strategyId: 's-1',
    strategy: baseStrategy,
    lastFilteredSymbols: {
      symbols: ['BTC_USDT', 'ETH_USDT', 'SOL_USDT'],
      runAt: Date.now(),
      criteria: 'top 30',
    },
  });
  useAppStore.setState({ focusedSymbol: null });
});

afterEach(() => {
  cleanup();
  useAppStore.setState({ focusedSymbol: null });
});

describe('FilteredSymbolsTab', () => {
  it('shows draft chip count + filtered table count', () => {
    render(<FilteredSymbolsTab />);
    expect(screen.getByText('草稿 · 1 个币')).toBeTruthy();
    expect(screen.getByText('上次 AI 筛出 · 3 个')).toBeTruthy();
  });

  it('"+ 加入" appends a filtered symbol to draft and flips to "✓ 已加入"', async () => {
    render(<FilteredSymbolsTab />);
    // ETH_USDT is not in draft → "+ 加入" available.
    const addBtns = screen.getAllByText('+ 加入');
    expect(addBtns.length).toBeGreaterThan(0);
    fireEvent.click(addBtns[0]); // ETH_USDT (BTC is already in draft)
    // Wait a tick for the async patchDraft → state update.
    await new Promise((r) => setTimeout(r, 0));
    // The store should have been updated via patchStrategyDraft mock.
    const draft = useStrategySessionStore.getState().strategy?.draft_symbols ?? [];
    expect(draft).toContain('ETH_USDT');
  });

  it('"+ 全部加入草稿" dedupes — BTC already in draft is not duplicated', async () => {
    render(<FilteredSymbolsTab />);
    const allBtn = screen.getByText('+ 全部加入草稿');
    fireEvent.click(allBtn);
    await new Promise((r) => setTimeout(r, 0));
    const draft = useStrategySessionStore.getState().strategy?.draft_symbols ?? [];
    // BTC stays once + ETH + SOL added = 3, not 4.
    expect(draft.length).toBe(3);
    expect(draft.filter((s) => s === 'BTC_USDT').length).toBe(1);
  });

  it('removing a draft chip via × shrinks draft_symbols', async () => {
    render(<FilteredSymbolsTab />);
    const x = screen.getByLabelText('从草稿移除 BTC_USDT');
    fireEvent.click(x);
    await new Promise((r) => setTimeout(r, 0));
    const draft = useStrategySessionStore.getState().strategy?.draft_symbols ?? [];
    expect(draft).not.toContain('BTC_USDT');
  });

  it('clicking a filtered row sets focusedSymbol via appStore', () => {
    render(<FilteredSymbolsTab />);
    fireEvent.click(screen.getByText('SOL_USDT'));
    expect(useAppStore.getState().focusedSymbol).toBe('SOL_USDT');
  });

  it('filtered tab empty state shows when lastFilteredSymbols is null', () => {
    useStrategySessionStore.setState({ lastFilteredSymbols: null });
    render(<FilteredSymbolsTab />);
    expect(screen.getByText(/还没让 AI 筛过/)).toBeTruthy();
  });
});
