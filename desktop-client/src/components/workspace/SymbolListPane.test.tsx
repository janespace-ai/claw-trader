import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SymbolListPane } from './SymbolListPane';
import { useStrategySessionStore, type WorkspaceStrategy } from '@/stores/strategySessionStore';

// Mock react-i18next so component renders default-value text in tests.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
  }),
}));

function fixture(overrides: Partial<WorkspaceStrategy> = {}): WorkspaceStrategy {
  return {
    id: 's-1',
    name: 'BTC 均值回归 v1',
    code_type: 'strategy',
    code: '',
    current_version: 1,
    created_at: 1700000000,
    updated_at: 1700000000,
    draft_code: null,
    draft_symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
    saved_code: null,
    saved_symbols: null,
    saved_at: null,
    last_backtest: undefined,
    is_archived_draft: false,
    ...overrides,
  };
}

beforeEach(() => {
  useStrategySessionStore.getState().reset();
});

afterEach(() => {
  cleanup();
});

describe('SymbolListPane', () => {
  it('renders strategy name + symbol count badge', () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture(),
    });
    render(<SymbolListPane />);
    expect(screen.getByText('BTC 均值回归 v1')).toBeTruthy();
    // count pill displays "3"
    const pills = screen.getAllByText('3');
    expect(pills.length).toBeGreaterThan(0);
  });

  it('lists each symbol from draft_symbols', () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture(),
    });
    render(<SymbolListPane />);
    expect(screen.getByText('BTC/USDT')).toBeTruthy();
    expect(screen.getByText('ETH/USDT')).toBeTruthy();
    expect(screen.getByText('SOL/USDT')).toBeTruthy();
  });

  it('shows empty-state copy when draft_symbols is empty', () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture({ draft_symbols: [] }),
    });
    render(<SymbolListPane />);
    expect(screen.getByText(/币列表会出现在这里/)).toBeTruthy();
  });

  it('clicking a symbol fires onFocusSymbol', () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture(),
    });
    const onFocus = vi.fn();
    render(<SymbolListPane onFocusSymbol={onFocus} />);
    fireEvent.click(screen.getByText('ETH/USDT'));
    expect(onFocus).toHaveBeenCalledWith('ETH/USDT');
  });

  it('clicking "AI 帮我改币种" fires onAskAI', () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture(),
    });
    const onAsk = vi.fn();
    render(<SymbolListPane onAskAI={onAsk} />);
    fireEvent.click(screen.getByText('AI 帮我改币种'));
    expect(onAsk).toHaveBeenCalledOnce();
  });
});
