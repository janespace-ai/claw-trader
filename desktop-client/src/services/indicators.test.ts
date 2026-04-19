import { describe, it, expect } from 'vitest';
import {
  sma,
  ema,
  bollinger,
  rsi,
  macd,
  stochastic,
  atr,
  obv,
  vwap,
  donchian,
  type CandleLike,
} from './indicators';

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

function mkOHLCV(
  bars: { o: number; h: number; l: number; c: number; v: number }[],
): CandleLike[] {
  return bars.map((b, i) => ({ ts: 1_700_000_000 + i * 3600, ...b }));
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

describe('macd', () => {
  it('returns three aligned series', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i);
    const result = macd(mkCandles(closes), 12, 26, 9);
    expect(result.macd.length).toBeGreaterThan(0);
    expect(result.signal.length).toBeGreaterThan(0);
    // histogram must never be longer than signal (requires both).
    expect(result.histogram.length).toBeLessThanOrEqual(result.signal.length);
  });

  it('produces monotonically trending MACD on rising prices', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
    const result = macd(mkCandles(closes));
    // For strongly rising series, MACD stays positive most of the time.
    const positive = result.macd.filter((p) => p.value > 0).length;
    expect(positive / result.macd.length).toBeGreaterThan(0.5);
  });
});

describe('stochastic', () => {
  it('returns values in 0-100 range', () => {
    const bars = Array.from({ length: 30 }, (_, i) => ({
      o: 100 + i,
      h: 100 + i + 2,
      l: 100 + i - 2,
      c: 100 + i,
      v: 0,
    }));
    const result = stochastic(mkOHLCV(bars), 14, 3);
    for (const p of result.k) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(100);
    }
  });

  it('%D is shorter than %K by dPeriod-1', () => {
    const bars = Array.from({ length: 25 }, (_, i) => ({
      o: 100,
      h: 102,
      l: 98,
      c: 100 + (i % 3),
      v: 0,
    }));
    const result = stochastic(mkOHLCV(bars), 14, 3);
    expect(result.k.length - result.d.length).toBe(2);
  });
});

describe('atr', () => {
  it('returns empty when data ≤ period', () => {
    expect(atr(mkCandles([1, 2, 3]), 14)).toEqual([]);
  });

  it('measures volatility on ranging candles', () => {
    const bars = Array.from({ length: 30 }, () => ({
      o: 100,
      h: 105,
      l: 95,
      c: 100,
      v: 0,
    }));
    const result = atr(mkOHLCV(bars), 14);
    // Constant range of 10 → ATR converges to 10.
    expect(result[result.length - 1].value).toBeCloseTo(10, 1);
  });
});

describe('obv', () => {
  it('accumulates signed volume', () => {
    const bars = [
      { o: 100, h: 100, l: 100, c: 100, v: 0 },
      { o: 100, h: 100, l: 100, c: 101, v: 100 }, // up
      { o: 101, h: 101, l: 101, c: 100, v: 50 }, // down
      { o: 100, h: 100, l: 100, c: 102, v: 80 }, // up
    ];
    const result = obv(mkOHLCV(bars));
    expect(result.map((p) => p.value)).toEqual([0, 100, 50, 130]);
  });
});

describe('vwap', () => {
  it('falls back to close when window volume is zero', () => {
    const result = vwap(mkCandles([10, 11, 12, 13, 14]), 3);
    // All v=0 → typical pv/vv is 0/0, fallback to close.
    expect(result[0].value).toBe(12);
  });
});

describe('donchian', () => {
  it('returns highs/lows/midline over lookback window', () => {
    const bars = [
      { o: 1, h: 5, l: 0, c: 3, v: 0 },
      { o: 3, h: 6, l: 2, c: 4, v: 0 },
      { o: 4, h: 7, l: 3, c: 5, v: 0 },
    ];
    const result = donchian(mkOHLCV(bars), 3);
    expect(result.upper[0].value).toBe(7);
    expect(result.lower[0].value).toBe(0);
    expect(result.middle[0].value).toBe(3.5);
  });
});
