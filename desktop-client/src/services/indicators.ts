// Client-side technical indicator computations used by the Strategy
// Design chart. Each function takes the same `CandlePoint[]` the chart
// renders and emits a list of `{ ts, value }` points, matching the
// `OverlayLine.data` shape that `ClawChart.Candles` consumes.
//
// Conventions
//  - Indicators are computed from the **close** price unless noted.
//  - The first `period - 1` bars are undefined mathematically; they're
//    omitted from the output so the overlay line starts where the
//    indicator stabilises.
//  - No external dependencies — everything is small enough to implement
//    inline. This matches the contract: overlays are decorative
//    (they don't drive trade decisions; that's the strategy code's job).

export interface CandleLike {
  ts: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Optional — volume isn't used by any indicator here, but the type
   *  matches `CandlePoint` (where volume is optional) so chart callers
   *  can pass the same array straight in. */
  v?: number;
}

export interface IndicatorPoint {
  ts: number;
  value: number;
}

// ---- SMA -------------------------------------------------------------------

/** Simple Moving Average over the last `period` closes. */
export function sma(candles: CandleLike[], period = 20): IndicatorPoint[] {
  if (candles.length < period || period <= 0) return [];
  const out: IndicatorPoint[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].c;
    if (i >= period) sum -= candles[i - period].c;
    if (i >= period - 1) {
      out.push({ ts: candles[i].ts, value: sum / period });
    }
  }
  return out;
}

// ---- EMA -------------------------------------------------------------------

/** Exponential Moving Average. Seeds with the SMA of the first `period`
 *  closes, then applies the standard smoothing factor `k = 2 / (p + 1)`. */
export function ema(candles: CandleLike[], period = 20): IndicatorPoint[] {
  if (candles.length < period || period <= 0) return [];
  const k = 2 / (period + 1);
  const out: IndicatorPoint[] = [];
  // Seed EMA with SMA of the first `period` bars.
  let seed = 0;
  for (let i = 0; i < period; i++) seed += candles[i].c;
  seed /= period;
  let prev = seed;
  out.push({ ts: candles[period - 1].ts, value: prev });
  for (let i = period; i < candles.length; i++) {
    const next = candles[i].c * k + prev * (1 - k);
    out.push({ ts: candles[i].ts, value: next });
    prev = next;
  }
  return out;
}

// ---- Bollinger Bands -------------------------------------------------------

export interface BollingerBands {
  upper: IndicatorPoint[];
  middle: IndicatorPoint[];
  lower: IndicatorPoint[];
}

/** Bollinger Bands: middle = SMA(period), upper = middle + k·σ,
 *  lower = middle - k·σ. Default `period = 20`, `k = 2` (classic). */
export function bollinger(
  candles: CandleLike[],
  period = 20,
  k = 2,
): BollingerBands {
  if (candles.length < period || period <= 0) {
    return { upper: [], middle: [], lower: [] };
  }
  const upper: IndicatorPoint[] = [];
  const middle: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].c;
    const mean = sum / period;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = candles[j].c - mean;
      sq += d * d;
    }
    const stdev = Math.sqrt(sq / period);
    const ts = candles[i].ts;
    middle.push({ ts, value: mean });
    upper.push({ ts, value: mean + k * stdev });
    lower.push({ ts, value: mean - k * stdev });
  }
  return { upper, middle, lower };
}

// ---- RSI -------------------------------------------------------------------

/** Relative Strength Index using Wilder's smoothing. Output is in the
 *  0-100 range, which does NOT overlay naturally on the price chart —
 *  consumers typically render it in a separate pane. */
export function rsi(candles: CandleLike[], period = 14): IndicatorPoint[] {
  if (candles.length <= period || period <= 0) return [];
  const out: IndicatorPoint[] = [];
  let gain = 0;
  let loss = 0;
  // Seed with simple average of first `period` moves.
  for (let i = 1; i <= period; i++) {
    const d = candles[i].c - candles[i - 1].c;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const rs0 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  out.push({ ts: candles[period].ts, value: rs0 });
  for (let i = period + 1; i < candles.length; i++) {
    const d = candles[i].c - candles[i - 1].c;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    out.push({ ts: candles[i].ts, value: rsi });
  }
  return out;
}
