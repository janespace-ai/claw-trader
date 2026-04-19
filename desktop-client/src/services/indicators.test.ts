import { describe, it, expect } from 'vitest';
import { sma, ema, bollinger, rsi, type CandleLike } from './indicators';

function mkCandles(closes: number[]): CandleLike[] {
  return closes.map((c, i) => ({
    ts: 1_700_000_000 + i * 3600,
    o: c,
    h: c,
    l: c,
    c,
    v: 0,
  }));
}

describe('sma', () => {
  it('returns empty when period exceeds data length', () => {
    expect(sma(mkCandles([1, 2, 3]), 5)).toEqual([]);
  });

  it('computes trailing averages starting at bar period-1', () => {
    const result = sma(mkCandles([1, 2, 3, 4, 5]), 3);
    // (1+2+3)/3=2, (2+3+4)/3=3, (3+4+5)/3=4
    expect(result.map((p) => p.value)).toEqual([2, 3, 4]);
  });

  it('ignores invalid period', () => {
    expect(sma(mkCandles([1, 2, 3]), 0)).toEqual([]);
  });
});

describe('ema', () => {
  it('seeds with SMA and applies smoothing factor', () => {
    const result = ema(mkCandles([10, 20, 30, 40, 50]), 3);
    expect(result.length).toBe(3);
    // Seed = SMA(first 3) = 20. k=2/(3+1)=0.5.
    expect(result[0].value).toBeCloseTo(20, 6);
    // Next: 40 * 0.5 + 20 * 0.5 = 30.
    expect(result[1].value).toBeCloseTo(30, 6);
    // Next: 50 * 0.5 + 30 * 0.5 = 40.
    expect(result[2].value).toBeCloseTo(40, 6);
  });
});

describe('bollinger', () => {
  it('produces three aligned series for constant closes', () => {
    const result = bollinger(mkCandles([5, 5, 5, 5, 5]), 3);
    // σ = 0 → all three bands identical at 5.
    expect(result.middle.map((p) => p.value)).toEqual([5, 5, 5]);
    expect(result.upper.map((p) => p.value)).toEqual([5, 5, 5]);
    expect(result.lower.map((p) => p.value)).toEqual([5, 5, 5]);
  });

  it('spreads bands by k·σ', () => {
    // closes 2,4,6 → mean=4, σ=√((4+0+4)/3)=√(8/3)≈1.633
    const result = bollinger(mkCandles([2, 4, 6]), 3, 2);
    expect(result.middle[0].value).toBeCloseTo(4, 5);
    expect(result.upper[0].value).toBeCloseTo(4 + 2 * Math.sqrt(8 / 3), 5);
    expect(result.lower[0].value).toBeCloseTo(4 - 2 * Math.sqrt(8 / 3), 5);
  });
});

describe('rsi', () => {
  it('returns empty when data ≤ period', () => {
    expect(rsi(mkCandles([1, 2, 3]), 14)).toEqual([]);
  });

  it('reports 100 when only gains (avgLoss = 0)', () => {
    const closes = Array.from({ length: 20 }, (_, i) => i + 1);
    const result = rsi(mkCandles(closes), 14);
    expect(result[0].value).toBe(100);
  });

  it('reports 0 when only losses', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i);
    const result = rsi(mkCandles(closes), 14);
    // First RSI value: avgGain=0, avgLoss>0 → RS=0, RSI=0.
    expect(result[0].value).toBeCloseTo(0, 6);
  });
});
