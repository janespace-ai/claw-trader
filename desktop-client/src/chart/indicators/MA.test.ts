import { describe, expect, it } from 'vitest';
import MA from './MA';
import type { Candle } from '../types';

function fixture(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    time: 1700000000 + i * 60,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }));
}

describe('MA indicator', () => {
  it('computes a 5-period SMA correctly', () => {
    const candles = fixture([10, 20, 30, 40, 50, 60, 70]);
    const result = MA.compute(candles, { periods: [5] });
    const ma5 = result.series['MA5'];
    // First MA5 value = (10+20+30+40+50)/5 = 30
    expect(ma5[0].value).toBe(30);
    // Second = (20+30+40+50+60)/5 = 40
    expect(ma5[1].value).toBe(40);
    // Third = (30+40+50+60+70)/5 = 50
    expect(ma5[2].value).toBe(50);
  });

  it('classifies as overlay', () => {
    expect(MA.kind).toBe('overlay');
  });

  it('handles multiple periods', () => {
    const candles = fixture(Array.from({ length: 100 }, (_, i) => i));
    const result = MA.compute(candles, { periods: [5, 10, 30, 60] });
    expect(Object.keys(result.series).sort()).toEqual(
      ['MA10', 'MA30', 'MA5', 'MA60'],
    );
  });

  it('is deterministic — same input → same output', () => {
    const candles = fixture([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const a = MA.compute(candles, { periods: [3] });
    const b = MA.compute(candles, { periods: [3] });
    expect(a).toEqual(b);
  });
});
