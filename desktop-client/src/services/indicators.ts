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

/** Dense indicator output: every point has a real numeric value.
 *  Indicator math (`sma`, `ema`, `rsi`, …) only emits the bars where
 *  the indicator has stabilised, so warmup bars are dropped entirely. */
export interface IndicatorPoint {
  ts: number;
  value: number;
}

/** Gap-tolerant indicator series: `value === null` marks a whitespace
 *  (warmup) bar that still occupies a logical index on the chart but
 *  has no visible value. Produced by `alignToCandles` when an
 *  indicator is padded to a parent candles grid so cross-chart
 *  logical-range sync stays in register. */
export interface IndicatorSeriesPoint {
  ts: number;
  value: number | null;
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

// ---- MACD ------------------------------------------------------------------

export interface MacdSeries {
  macd: IndicatorPoint[];
  signal: IndicatorPoint[];
  histogram: IndicatorPoint[];
}

/** MACD = EMA(fast) − EMA(slow); signal = EMA(MACD, signalPeriod);
 *  histogram = MACD − signal. Classic defaults: 12/26/9. */
export function macd(
  candles: CandleLike[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdSeries {
  const fast = ema(candles, fastPeriod);
  const slow = ema(candles, slowPeriod);
  if (fast.length === 0 || slow.length === 0) {
    return { macd: [], signal: [], histogram: [] };
  }
  // Align: slow starts later; restrict to timestamps where both exist.
  const fastMap = new Map(fast.map((p) => [p.ts, p.value]));
  const macdLine: IndicatorPoint[] = [];
  for (const p of slow) {
    const f = fastMap.get(p.ts);
    if (f == null) continue;
    macdLine.push({ ts: p.ts, value: f - p.value });
  }
  // Signal = EMA of macdLine. Build pseudo-candles so we can reuse ema().
  const pseudo: CandleLike[] = macdLine.map((p) => ({
    ts: p.ts,
    o: p.value,
    h: p.value,
    l: p.value,
    c: p.value,
  }));
  const signalLine = ema(pseudo, signalPeriod);
  const signalMap = new Map(signalLine.map((p) => [p.ts, p.value]));
  const histogram: IndicatorPoint[] = macdLine
    .map((p) => {
      const s = signalMap.get(p.ts);
      if (s == null) return null;
      return { ts: p.ts, value: p.value - s };
    })
    .filter((x): x is IndicatorPoint => x != null);
  return { macd: macdLine, signal: signalLine, histogram };
}

// ---- Stochastic Oscillator -------------------------------------------------

export interface StochSeries {
  k: IndicatorPoint[];
  d: IndicatorPoint[];
}

/** %K = 100·(close − lowN)/(highN − lowN); %D = SMA(%K, dPeriod).
 *  Defaults: kPeriod=14, dPeriod=3. */
export function stochastic(
  candles: CandleLike[],
  kPeriod = 14,
  dPeriod = 3,
): StochSeries {
  if (candles.length < kPeriod) return { k: [], d: [] };
  const k: IndicatorPoint[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].h > hi) hi = candles[j].h;
      if (candles[j].l < lo) lo = candles[j].l;
    }
    const range = hi - lo;
    const val = range === 0 ? 50 : (100 * (candles[i].c - lo)) / range;
    k.push({ ts: candles[i].ts, value: val });
  }
  // %D = SMA of %K.
  const d: IndicatorPoint[] = [];
  if (k.length >= dPeriod) {
    let sum = 0;
    for (let i = 0; i < k.length; i++) {
      sum += k[i].value;
      if (i >= dPeriod) sum -= k[i - dPeriod].value;
      if (i >= dPeriod - 1) d.push({ ts: k[i].ts, value: sum / dPeriod });
    }
  }
  return { k, d };
}

// ---- Average True Range ----------------------------------------------------

/** ATR via Wilder's smoothing over true-range values. */
export function atr(candles: CandleLike[], period = 14): IndicatorPoint[] {
  if (candles.length <= period) return [];
  // True range for each bar.
  const tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].h;
    const l = candles[i].l;
    const pc = candles[i - 1].c;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  // Seed: SMA of first `period` TRs (skipping TR[0]=0).
  let prev = 0;
  for (let i = 1; i <= period; i++) prev += tr[i];
  prev /= period;
  const out: IndicatorPoint[] = [{ ts: candles[period].ts, value: prev }];
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out.push({ ts: candles[i].ts, value: prev });
  }
  return out;
}

// ---- On-Balance Volume -----------------------------------------------------

/** OBV accumulates signed volume based on close-to-close direction. */
export function obv(candles: CandleLike[]): IndicatorPoint[] {
  if (candles.length === 0) return [];
  let acc = 0;
  const out: IndicatorPoint[] = [{ ts: candles[0].ts, value: 0 }];
  for (let i = 1; i < candles.length; i++) {
    const v = candles[i].v ?? 0;
    const dir = candles[i].c > candles[i - 1].c ? 1 : candles[i].c < candles[i - 1].c ? -1 : 0;
    acc += dir * v;
    out.push({ ts: candles[i].ts, value: acc });
  }
  return out;
}

// ---- Volume-Weighted Average Price (intraday) ------------------------------

/** Session-reset VWAP is noisy without session boundaries; we use a
 *  rolling N-bar VWAP which is good enough for an overlay. */
export function vwap(candles: CandleLike[], window = 20): IndicatorPoint[] {
  if (candles.length < window) return [];
  const out: IndicatorPoint[] = [];
  for (let i = window - 1; i < candles.length; i++) {
    let pv = 0;
    let vv = 0;
    for (let j = i - window + 1; j <= i; j++) {
      const typical = (candles[j].h + candles[j].l + candles[j].c) / 3;
      const v = candles[j].v ?? 0;
      pv += typical * v;
      vv += v;
    }
    out.push({ ts: candles[i].ts, value: vv === 0 ? candles[i].c : pv / vv });
  }
  return out;
}

// ---- Donchian Channels -----------------------------------------------------

export interface Donchian {
  upper: IndicatorPoint[];
  lower: IndicatorPoint[];
  middle: IndicatorPoint[];
}

/** Highest high / lowest low over `period` bars, plus the midline. */
export function donchian(candles: CandleLike[], period = 20): Donchian {
  if (candles.length < period) return { upper: [], lower: [], middle: [] };
  const upper: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];
  const middle: IndicatorPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].h > hi) hi = candles[j].h;
      if (candles[j].l < lo) lo = candles[j].l;
    }
    const ts = candles[i].ts;
    upper.push({ ts, value: hi });
    lower.push({ ts, value: lo });
    middle.push({ ts, value: (hi + lo) / 2 });
  }
  return { upper, lower, middle };
}
