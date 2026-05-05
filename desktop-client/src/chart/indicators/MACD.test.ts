import { describe, expect, it } from 'vitest';
import MACD from './MACD';
import type { Candle } from '../types';

function fixture(n: number): Candle[] {
  // Synthetic price walk: alternating ±1 from a base of 100.
  return Array.from({ length: n }, (_, i) => {
    const close = 100 + Math.sin(i / 5) * 10;
    return {
      time: 1700000000 + i * 60,
      open: close,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 1,
    };
  });
}

describe('MACD indicator', () => {
  it('computes DIF / DEA / HIST series with default 12/26/9', () => {
    const candles = fixture(100);
    const result = MACD.compute(candles, {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
    });
    expect(result.series.DIF).toBeDefined();
    expect(result.series.DEA).toBeDefined();
    expect(result.series.HIST).toBeDefined();
    expect(result.series.DIF.length).toBeGreaterThan(0);
  });

  it('classifies as subchart', () => {
    expect(MACD.kind).toBe('subchart');
  });

  it('HIST values carry up/down color hints', () => {
    const candles = fixture(100);
    const result = MACD.compute(candles, {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
    });
    const hist = result.series.HIST as unknown as Array<{
      value: number;
      color: string;
    }>;
    for (const p of hist) {
      expect(['#22C55E', '#EF4444']).toContain(p.color);
    }
  });
});
