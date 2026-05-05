import { describe, expect, it } from 'vitest';
import {
  INDICATOR_REGISTRY,
  getAllIndicatorNames,
  getOverlayIndicators,
  getSubchartIndicators,
  getIndicatorDef,
} from './registry';

describe('chart-indicator-registry', () => {
  it('ships exactly 31 indicators (11 overlay + 20 subchart)', () => {
    expect(getAllIndicatorNames()).toHaveLength(31);
    expect(getOverlayIndicators()).toHaveLength(11);
    expect(getSubchartIndicators()).toHaveLength(20);
  });

  it('every entry has a unique name + valid kind', () => {
    const names = getAllIndicatorNames();
    expect(new Set(names).size).toBe(names.length);
    for (const def of Object.values(INDICATOR_REGISTRY)) {
      expect(['overlay', 'subchart']).toContain(def.kind);
      expect(typeof def.compute).toBe('function');
      expect(typeof def.render).toBe('function');
    }
  });

  it('includes the 4 NEW vs klinecharts indicators', () => {
    expect(getIndicatorDef('VWAP')?.kind).toBe('overlay');
    expect(getIndicatorDef('SuperTrend')?.kind).toBe('overlay');
    expect(getIndicatorDef('Ichimoku')?.kind).toBe('overlay');
    expect(getIndicatorDef('Keltner')?.kind).toBe('overlay');
  });

  it('preserves the 27 ported from klinecharts', () => {
    const ported = [
      'MA', 'EMA', 'SMA', 'BOLL', 'SAR', 'BBI', 'AVP',
      'VOL', 'MACD', 'RSI', 'KDJ', 'CCI', 'BIAS', 'BRAR', 'CR', 'PSY',
      'DMA', 'TRIX', 'OBV', 'VR', 'WR', 'MTM', 'EMV', 'DMI', 'PVT',
      'AO', 'ROC',
    ];
    for (const name of ported) {
      expect(getIndicatorDef(name)).toBeDefined();
    }
  });

  it('getIndicatorDef returns undefined for unknown names', () => {
    expect(getIndicatorDef('NOPE')).toBeUndefined();
  });
});
