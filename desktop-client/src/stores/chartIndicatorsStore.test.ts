import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  useChartIndicatorsStore,
  SUBCHART_INDICATOR_CAP,
} from './chartIndicatorsStore';

beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
  // Reset store to defaults.
  useChartIndicatorsStore.getState().reset();
});

afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

describe('chartIndicatorsStore', () => {
  it('defaults to overlays=[MA] subcharts=[VOL]', () => {
    const s = useChartIndicatorsStore.getState();
    expect(s.overlays).toEqual(['MA']);
    expect(s.subcharts).toEqual(['VOL']);
  });

  it('toggleOverlay adds then removes', () => {
    useChartIndicatorsStore.getState().toggleOverlay('BOLL');
    expect(useChartIndicatorsStore.getState().overlays).toContain('BOLL');
    useChartIndicatorsStore.getState().toggleOverlay('BOLL');
    expect(useChartIndicatorsStore.getState().overlays).not.toContain('BOLL');
  });

  it('toggleSubchart returns ok=true under cap, ok=false at cap', () => {
    const fill = ['MACD', 'RSI', 'KDJ', 'CCI', 'BIAS']; // VOL already there → 6 total
    for (const n of fill) {
      const r = useChartIndicatorsStore.getState().toggleSubchart(n);
      expect(r.ok).toBe(true);
    }
    const sub = useChartIndicatorsStore.getState().subcharts;
    expect(sub.length).toBe(SUBCHART_INDICATOR_CAP); // 6
    // 7th add should be rejected.
    const r = useChartIndicatorsStore.getState().toggleSubchart('WR');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('cap');
    expect(useChartIndicatorsStore.getState().subcharts.length).toBe(
      SUBCHART_INDICATOR_CAP,
    );
  });

  it('toggleSubchart removing an active item works at the cap', () => {
    // Fill to 6
    ['MACD', 'RSI', 'KDJ', 'CCI', 'BIAS'].forEach((n) =>
      useChartIndicatorsStore.getState().toggleSubchart(n),
    );
    expect(useChartIndicatorsStore.getState().subcharts.length).toBe(6);
    // Toggle one off → returns ok=true (it was a removal)
    const r = useChartIndicatorsStore.getState().toggleSubchart('VOL');
    expect(r.ok).toBe(true);
    expect(useChartIndicatorsStore.getState().subcharts).not.toContain('VOL');
  });

  it('removeOverlay / removeSubchart work', () => {
    useChartIndicatorsStore.getState().removeOverlay('MA');
    expect(useChartIndicatorsStore.getState().overlays).toEqual([]);
    useChartIndicatorsStore.getState().removeSubchart('VOL');
    expect(useChartIndicatorsStore.getState().subcharts).toEqual([]);
  });

  it('persists to localStorage and re-hydrates', async () => {
    useChartIndicatorsStore.getState().toggleOverlay('EMA');
    useChartIndicatorsStore.getState().toggleSubchart('MACD');
    // Wait a tick for zustand persist middleware to flush.
    await new Promise((r) => setTimeout(r, 0));
    const raw = localStorage.getItem('claw:chart-indicators');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.overlays).toContain('EMA');
    expect(parsed.state.subcharts).toContain('MACD');
  });
});
