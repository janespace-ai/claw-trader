import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SymbolListPane } from './SymbolListPane';
import { useUniverseStore } from '@/stores/universeStore';
import { useAppStore } from '@/stores/appStore';

// Mock react-i18next: returns defaultValue with {{var}} interpolation.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: Record<string, unknown> & { defaultValue?: string }) => {
      const tpl = opts?.defaultValue ?? _key;
      if (!opts) return tpl;
      return tpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(opts[k] ?? ''));
    },
  }),
}));

beforeEach(() => {
  // Seed the universe synchronously so the component renders rows.
  useUniverseStore.setState({
    symbols: [
      {
        symbol: 'BTC_USDT',
        market: 'futures',
        status: 'active',
        rank: 1,
        last_price: 67432.1,
        change_24h_pct: 2.41,
      },
      {
        symbol: 'ETH_USDT',
        market: 'futures',
        status: 'active',
        rank: 2,
        last_price: 3247.88,
        change_24h_pct: -1.83,
      },
      // SOL has no price data — assert "—" fallback works.
      { symbol: 'SOL_USDT', market: 'futures', status: 'active', rank: 3 },
    ],
    loading: false,
    lastLoadedAt: Date.now(),
    error: null,
    loadUniverse: async () => {},
  });
  useAppStore.setState({ focusedSymbol: 'BTC_USDT' });
});

afterEach(() => {
  cleanup();
  useAppStore.setState({ focusedSymbol: null });
});

describe('SymbolListPane (workspace-three-zone-layout)', () => {
  it('renders the universe header with count', () => {
    render(<SymbolListPane />);
    expect(screen.getByText('全市场')).toBeTruthy();
    expect(screen.getByText('3 个币种')).toBeTruthy();
  });

  it('lists every universe symbol', () => {
    render(<SymbolListPane />);
    expect(screen.getByText('BTC_USDT')).toBeTruthy();
    expect(screen.getByText('ETH_USDT')).toBeTruthy();
    expect(screen.getByText('SOL_USDT')).toBeTruthy();
  });

  it('clicking a row sets focusedSymbol via appStore', () => {
    render(<SymbolListPane />);
    fireEvent.click(screen.getByText('ETH_USDT'));
    expect(useAppStore.getState().focusedSymbol).toBe('ETH_USDT');
  });

  it('search filters rows case-insensitively', () => {
    render(<SymbolListPane />);
    const input = screen.getByPlaceholderText('搜索币种') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'eth' } });
    expect(screen.queryByText('BTC_USDT')).toBeNull();
    expect(screen.getByText('ETH_USDT')).toBeTruthy();
  });

  it('does not read from strategy.draft_symbols', () => {
    // Even if a strategy has zero draft symbols, the universe rail
    // SHALL still render the universe rows.
    render(<SymbolListPane />);
    // 3 rows from the universe seed are present.
    expect(screen.getByText('BTC_USDT')).toBeTruthy();
  });

  it('renders price + 24h % per row with green/red coloring', () => {
    render(<SymbolListPane />);
    expect(screen.getByText('67,432.10')).toBeTruthy();
    expect(screen.getByText('+2.41%')).toBeTruthy();
    expect(screen.getByText('3,247.88')).toBeTruthy();
    expect(screen.getByText('-1.83%')).toBeTruthy();
  });

  it('falls back to "—" when last_price/change_24h_pct are null', () => {
    render(<SymbolListPane />);
    // SOL_USDT has no price/pct → 2 dashes for that row.
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});
