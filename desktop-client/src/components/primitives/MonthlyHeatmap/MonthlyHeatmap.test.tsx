import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonthlyHeatmap } from './MonthlyHeatmap';

describe('MonthlyHeatmap', () => {
  it('renders an empty-state message when no data', () => {
    render(<MonthlyHeatmap data={[]} />);
    expect(screen.getByText(/No monthly returns/i)).toBeDefined();
  });

  it('renders a grid cell per month with aria-label showing the pct', () => {
    render(
      <MonthlyHeatmap
        data={[
          { month: '2024-01', value: 0.05, trades: 3 },
          { month: '2024-02', value: -0.03, trades: 2 },
        ]}
      />,
    );
    const cells = screen.getAllByRole('gridcell');
    // 12 months rendered for 2024 (filled + blank)
    expect(cells.length).toBe(12);
    expect(cells.some((c) => c.getAttribute('aria-label')?.includes('5.00%'))).toBe(true);
    expect(cells.some((c) => c.getAttribute('aria-label')?.includes('-3.00%'))).toBe(true);
  });

  it('spans multiple years', () => {
    render(
      <MonthlyHeatmap
        data={[
          { month: '2023-12', value: 0.01 },
          { month: '2024-01', value: 0.02 },
        ]}
      />,
    );
    const cells = screen.getAllByRole('gridcell');
    expect(cells.length).toBe(24);
  });
});
