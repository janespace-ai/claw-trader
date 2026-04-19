import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// lightweight-charts uses canvas which jsdom doesn't support. Stub Mini
// so we can exercise the grid layout + interactions in isolation.
vi.mock('@/components/primitives', () => ({
  ClawChart: { Mini: () => null },
}));

import { CrossSymbolGrid, type SymbolCell } from './CrossSymbolGrid';

const cells: SymbolCell[] = [
  { symbol: 'BTC_USDT', returnPct: 0.12, trades: 5, equity: [{ ts: 1, value: 1 }, { ts: 2, value: 1.12 }] },
  { symbol: 'ETH_USDT', returnPct: -0.05, trades: 3 },
  { symbol: 'SOL_USDT', returnPct: 0.02, trades: 1 },
];

describe('CrossSymbolGrid', () => {
  it('renders one cell per input', () => {
    render(<CrossSymbolGrid cells={cells} />);
    expect(screen.getByText('BTC_USDT')).toBeDefined();
    expect(screen.getByText('ETH_USDT')).toBeDefined();
    expect(screen.getByText('SOL_USDT')).toBeDefined();
  });

  it('shows empty state when no cells', () => {
    render(<CrossSymbolGrid cells={[]} />);
    expect(screen.getByText(/No per-symbol/i)).toBeDefined();
  });

  it('single-click triggers onSingleClick', () => {
    const cb = vi.fn();
    render(<CrossSymbolGrid cells={cells} onSingleClick={cb} />);
    fireEvent.click(screen.getByText('BTC_USDT').closest('div[class*="cursor-pointer"]')!);
    expect(cb).toHaveBeenCalledWith('BTC_USDT');
  });

  it('double-click triggers onDoubleClick', () => {
    const cb = vi.fn();
    render(<CrossSymbolGrid cells={cells} onDoubleClick={cb} />);
    fireEvent.doubleClick(screen.getByText('ETH_USDT').closest('div[class*="cursor-pointer"]')!);
    expect(cb).toHaveBeenCalledWith('ETH_USDT');
  });

  it('sort-by select re-orders the cells', () => {
    const { container } = render(<CrossSymbolGrid cells={cells} />);
    // Default is return-desc: BTC (+12%), SOL (+2%), ETH (-5%)
    const symbolsBefore = Array.from(container.querySelectorAll('span.font-heading')).map((n) => n.textContent);
    expect(symbolsBefore).toEqual(['BTC_USDT', 'SOL_USDT', 'ETH_USDT']);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'symbol' } });
    const symbolsAfter = Array.from(container.querySelectorAll('span.font-heading')).map((n) => n.textContent);
    expect(symbolsAfter).toEqual(['BTC_USDT', 'ETH_USDT', 'SOL_USDT']);
  });
});
