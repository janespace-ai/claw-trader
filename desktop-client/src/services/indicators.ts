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

// ---- KDJ -------------------------------------------------------------------

export interface KDJ {
  k: IndicatorPoint[];
  d: IndicatorPoint[];
  j: IndicatorPoint[];
}

/** KDJ is a three-line stochastic variant popular in Chinese markets.
 *  K/D are smoothed %K/%D; J = 3K − 2D and can exceed the 0-100 range,
 *  signalling overbought/oversold momentum. */
export function kdj(candles: CandleLike[], kPeriod = 9, dPeriod = 3): KDJ {
  if (candles.length < kPeriod) return { k: [], d: [], j: [] };
  const k: IndicatorPoint[] = [];
  const d: IndicatorPoint[] = [];
  const j: IndicatorPoint[] = [];
  let prevK = 50;
  let prevD = 50;
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let n = i - kPeriod + 1; n <= i; n++) {
      if (candles[n].h > hi) hi = candles[n].h;
      if (candles[n].l < lo) lo = candles[n].l;
    }
    const range = hi - lo;
    const rsv = range === 0 ? 50 : (100 * (candles[i].c - lo)) / range;
    // Classic Chinese formulation: K = (2/3)·K_prev + (1/3)·RSV
    const kv = (2 / 3) * prevK + (1 / 3) * rsv;
    const dv = (2 / 3) * prevD + (1 / 3) * kv;
    const jv = 3 * kv - 2 * dv;
    k.push({ ts: candles[i].ts, value: kv });
    d.push({ ts: candles[i].ts, value: dv });
    j.push({ ts: candles[i].ts, value: jv });
    prevK = kv;
    prevD = dv;
  }
  // dPeriod is used for the initialization smoothing — dropping it is
  // intentional; the rolling EMA-style update already smooths D.
  void dPeriod;
  return { k, d, j };
}

// ---- Parabolic SAR ---------------------------------------------------------

/** Parabolic SAR (Welles Wilder). Returns one dot per bar, positioned
 *  below the bar in an uptrend and above in a downtrend — rendered as
 *  an overlay scatter on the price chart. */
export function sar(
  candles: CandleLike[],
  step = 0.02,
  maxStep = 0.2,
): IndicatorPoint[] {
  if (candles.length < 2) return [];
  const out: IndicatorPoint[] = [];
  // Assume first bar starts an uptrend (common initialization).
  let uptrend = candles[1].c >= candles[0].c;
  let ep = uptrend ? candles[0].h : candles[0].l;
  let af = step;
  let sarVal = uptrend ? candles[0].l : candles[0].h;
  for (let i = 1; i < candles.length; i++) {
    sarVal = sarVal + af * (ep - sarVal);
    const { h, l } = candles[i];
    if (uptrend) {
      // Stop can't be above the prior two lows.
      if (i >= 2) sarVal = Math.min(sarVal, candles[i - 1].l, candles[i - 2].l);
      if (l < sarVal) {
        // Flip to downtrend.
        uptrend = false;
        sarVal = ep;
        ep = l;
        af = step;
      } else if (h > ep) {
        ep = h;
        af = Math.min(af + step, maxStep);
      }
    } else {
      if (i >= 2) sarVal = Math.max(sarVal, candles[i - 1].h, candles[i - 2].h);
      if (h > sarVal) {
        uptrend = true;
        sarVal = ep;
        ep = h;
        af = step;
      } else if (l < ep) {
        ep = l;
        af = Math.min(af + step, maxStep);
      }
    }
    out.push({ ts: candles[i].ts, value: sarVal });
  }
  return out;
}

// ---- Commodity Channel Index ----------------------------------------------

/** CCI = (typical − SMA(typical)) / (0.015 · meanDeviation). Typically
 *  cycles in ±100; breaches of ±200 mark strong momentum. */
export function cci(candles: CandleLike[], period = 20): IndicatorPoint[] {
  if (candles.length < period) return [];
  const out: IndicatorPoint[] = [];
  const typical = candles.map((c) => (c.h + c.l + c.c) / 3);
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += typical[j];
    const avg = sum / period;
    let dev = 0;
    for (let j = i - period + 1; j <= i; j++) dev += Math.abs(typical[j] - avg);
    const meanDev = dev / period;
    const value = meanDev === 0 ? 0 : (typical[i] - avg) / (0.015 * meanDev);
    out.push({ ts: candles[i].ts, value });
  }
  return out;
}

// ---- Williams %R -----------------------------------------------------------

/** %R = -100 · (highN − close) / (highN − lowN). Output is 0 to -100. */
export function williamsR(candles: CandleLike[], period = 14): IndicatorPoint[] {
  if (candles.length < period) return [];
  const out: IndicatorPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].h > hi) hi = candles[j].h;
      if (candles[j].l < lo) lo = candles[j].l;
    }
    const range = hi - lo;
    // Adding `+ 0` normalises `-0` to `+0` at the overbought boundary
    // (when close === high, `-100 * 0 / range` is `-0` in IEEE-754).
    const raw = range === 0 ? -50 : (-100 * (hi - candles[i].c)) / range;
    out.push({ ts: candles[i].ts, value: raw + 0 });
  }
  return out;
}

// ---- Money Flow Index ------------------------------------------------------

/** MFI is a volume-weighted RSI. Output in 0-100. */
export function mfi(candles: CandleLike[], period = 14): IndicatorPoint[] {
  if (candles.length <= period) return [];
  const typical = candles.map((c) => (c.h + c.l + c.c) / 3);
  const rawFlow = candles.map((c, i) => typical[i] * (c.v ?? 0));
  const out: IndicatorPoint[] = [];
  for (let i = period; i < candles.length; i++) {
    let pos = 0;
    let neg = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (typical[j] > typical[j - 1]) pos += rawFlow[j];
      else if (typical[j] < typical[j - 1]) neg += rawFlow[j];
    }
    const value = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
    out.push({ ts: candles[i].ts, value });
  }
  return out;
}

// ---- Rate of Change --------------------------------------------------------

/** ROC = 100 · (close − close[N bars ago]) / close[N bars ago]. */
export function roc(candles: CandleLike[], period = 12): IndicatorPoint[] {
  if (candles.length <= period) return [];
  const out: IndicatorPoint[] = [];
  for (let i = period; i < candles.length; i++) {
    const prev = candles[i - period].c;
    const value = prev === 0 ? 0 : (100 * (candles[i].c - prev)) / prev;
    out.push({ ts: candles[i].ts, value });
  }
  return out;
}
