import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { IndicatorBar } from './IndicatorBar';
import {
  useChartIndicatorsStore,
  SUBCHART_INDICATOR_CAP,
} from '@/stores/chartIndicatorsStore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, opts?: Record<string, unknown> & { defaultValue?: string }) => {
      const tpl = opts?.defaultValue ?? _k;
      if (!opts) return tpl;
      return tpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(opts[k] ?? ''));
    },
  }),
}));

beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
  useChartIndicatorsStore.getState().reset();
});

afterEach(() => {
  cleanup();
});

describe('IndicatorBar (single-row layout)', () => {
  it('renders all overlay + subchart names in one strip', () => {
    render(<IndicatorBar />);
    expect(screen.getByText('指标')).toBeTruthy();
    expect(screen.getByText('MA')).toBeTruthy(); // overlay
    expect(screen.getByText('BOLL')).toBeTruthy(); // overlay
    expect(screen.getByText('VOL')).toBeTruthy(); // subchart
    expect(screen.getByText('MACD')).toBeTruthy(); // subchart
    // No more 主图/副图 row labels.
    expect(screen.queryByText('主图')).toBeNull();
    expect(screen.queryByText('副图')).toBeNull();
  });

  it('clicking an overlay name toggles it in the store', () => {
    render(<IndicatorBar />);
    fireEvent.click(screen.getByText('BOLL'));
    expect(useChartIndicatorsStore.getState().overlays).toContain('BOLL');
    fireEvent.click(screen.getByText('BOLL'));
    expect(useChartIndicatorsStore.getState().overlays).not.toContain('BOLL');
  });

  it('clicking a subchart name toggles it in the store', () => {
    render(<IndicatorBar />);
    fireEvent.click(screen.getByText('MACD'));
    expect(useChartIndicatorsStore.getState().subcharts).toContain('MACD');
  });

  it('active items get data-active="true"', () => {
    render(<IndicatorBar />);
    // MA + VOL are defaults.
    expect(screen.getByText('MA').getAttribute('data-active')).toBe('true');
    expect(screen.getByText('VOL').getAttribute('data-active')).toBe('true');
    expect(screen.getByText('BOLL').getAttribute('data-active')).toBe('false');
  });

  it('shows inline cap notice when adding 7th subchart', () => {
    ['MACD', 'RSI', 'KDJ', 'CCI', 'BIAS'].forEach((n) =>
      useChartIndicatorsStore.getState().toggleSubchart(n),
    );
    expect(useChartIndicatorsStore.getState().subcharts.length).toBe(
      SUBCHART_INDICATOR_CAP,
    );
    render(<IndicatorBar />);
    fireEvent.click(screen.getByText('WR'));
    expect(screen.getByText(/最多 6 个子图/)).toBeTruthy();
    expect(useChartIndicatorsStore.getState().subcharts.length).toBe(
      SUBCHART_INDICATOR_CAP,
    );
  });

  it('renders the subchart counter (e.g. "1/6")', () => {
    render(<IndicatorBar />);
    expect(screen.getByText('1/6')).toBeTruthy(); // VOL is default
  });
});
