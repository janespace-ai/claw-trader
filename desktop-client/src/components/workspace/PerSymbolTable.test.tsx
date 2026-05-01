import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PerSymbolTable, type PerSymbolRow } from './PerSymbolTable';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
  }),
}));

afterEach(() => cleanup());

const sample: PerSymbolRow[] = [
  { symbol: 'BTC/USDT', pnlPct: 0.248, sharpe: 2.13, winRate: 0.71, tradeCount: 42 },
  { symbol: 'ETH/USDT', pnlPct: 0.194, sharpe: 1.92, winRate: 0.68, tradeCount: 38 },
  { symbol: 'DOGE/USDT', pnlPct: -0.068, sharpe: -0.43, winRate: 0.42, tradeCount: 19 },
  { symbol: 'XRP/USDT', pnlPct: 0, sharpe: null, winRate: null, tradeCount: 0 },
];

describe('PerSymbolTable — rendering', () => {
  it('renders all rows by default + sortable headers', () => {
    render(
      <PerSymbolTable
        rows={sample}
        filter="all"
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText('BTC/USDT')).toBeTruthy();
    expect(screen.getByText('ETH/USDT')).toBeTruthy();
    expect(screen.getByText('DOGE/USDT')).toBeTruthy();
    expect(screen.getByText('XRP/USDT')).toBeTruthy();
    // Active sort indicator on PnL column (default)
    expect(screen.getByText('▼')).toBeTruthy();
  });

  it('formats positive PnL with + sign and percent', () => {
    render(
      <PerSymbolTable rows={sample} filter="all" onFilterChange={() => {}} />,
    );
    expect(screen.getByText('+24.80%')).toBeTruthy();
    expect(screen.getByText('-6.80%')).toBeTruthy();
  });
});

describe('PerSymbolTable — outcome filter', () => {
  it('filter="loss" only shows negative PnL rows', () => {
    render(
      <PerSymbolTable rows={sample} filter="loss" onFilterChange={() => {}} />,
    );
    expect(screen.queryByText('BTC/USDT')).toBeNull();
    expect(screen.getByText('DOGE/USDT')).toBeTruthy();
  });

  it('filter="profit" only shows positive PnL rows', () => {
    render(
      <PerSymbolTable rows={sample} filter="profit" onFilterChange={() => {}} />,
    );
    expect(screen.getByText('BTC/USDT')).toBeTruthy();
    expect(screen.getByText('ETH/USDT')).toBeTruthy();
    expect(screen.queryByText('DOGE/USDT')).toBeNull();
  });

  it('clicking a chip fires onFilterChange', () => {
    const onChange = vi.fn();
    render(<PerSymbolTable rows={sample} filter="all" onFilterChange={onChange} />);
    fireEvent.click(screen.getByText('亏损'));
    expect(onChange).toHaveBeenCalledWith('loss');
  });
});

describe('PerSymbolTable — sorting', () => {
  it('clicking PnL header twice flips direction', () => {
    render(
      <PerSymbolTable rows={sample} filter="all" onFilterChange={() => {}} />,
    );
    // Default desc (▼).  Click once → asc.
    fireEvent.click(screen.getByText('PnL %'));
    expect(screen.getByText('▲')).toBeTruthy();
  });

  it('clicking symbol header switches sort key + flips to asc default', () => {
    render(
      <PerSymbolTable rows={sample} filter="all" onFilterChange={() => {}} />,
    );
    fireEvent.click(screen.getByText('币种'));
    // Now sort by symbol ascending → BTC first
    const allSymbols = screen.getAllByText(/USDT$/);
    expect(allSymbols[0].textContent).toBe('BTC/USDT');
  });
});

describe('PerSymbolTable — row click drill-down', () => {
  it('clicking a row fires onFocusSymbol', () => {
    const onFocus = vi.fn();
    render(
      <PerSymbolTable
        rows={sample}
        filter="all"
        onFilterChange={() => {}}
        onFocusSymbol={onFocus}
      />,
    );
    fireEvent.click(screen.getByText('ETH/USDT'));
    expect(onFocus).toHaveBeenCalledWith('ETH/USDT');
  });
});
