/**
 * Viridia engine: momentum layer (RSI, MACD, divergences, crossovers).
 *
 * Deterministic and non-repainting. Every indicator value at bar i uses only bars 0..i. A swing pivot
 * at bar i is confirmed only at bar i + right, once the right-side bars have closed, and every event
 * carries both the pivot timestamps and the confirmation timestamp. Running this on a prefix of the
 * series therefore reproduces exactly the confirmed events whose confirmation bar is inside the prefix
 * (tested in tests/momentum.test.ts).
 *
 *   RSI   Wilder (1978): average gain and loss seeded with a simple mean over the first `period`
 *         changes, then smoothed with Wilder's RMA (alpha = 1 / period).
 *   EMA   seeded with the simple mean of the first `n` values, then alpha = 2 / (n + 1).
 *   MACD  EMA(fast) − EMA(slow); signal = EMA(signal) of MACD; histogram = MACD − signal.
 *
 * Values that need more history than exists are null, never estimated.
 */

export const MOMENTUM_VERSION = "momentum-1.0.0";

export interface MBar { ts: string; open: number; high: number; low: number; close: number; volume?: number | null }

export interface MomentumParams {
  rsiPeriod: number;
  fast: number;
  slow: number;
  signal: number;
  /** Pivot detection: bars that must be lower (for a high) on each side. */
  left: number;
  right: number;
  /** Bars between the two pivots of a divergence. */
  minSeparation: number;
  maxSeparation: number;
  /** Indicator extreme is taken within ± this many bars of the price pivot. */
  align: number;
  atrPeriod: number;
  /** Minimum price difference between the two pivots, in ATR units at confirmation. */
  minPriceAtr: number;
  /** Minimum RSI difference between the two indicator pivots, in RSI points. */
  minRsiDelta: number;
  /** Minimum MACD (or histogram) difference, in ATR units at confirmation. */
  minMacdAtr: number;
  /** How many recent bars count as "recent" for states such as "recovering from oversold". */
  recentBars: number;
}

export const DEFAULT_MOMENTUM_PARAMS: MomentumParams = {
  rsiPeriod: 14, fast: 12, slow: 26, signal: 9,
  left: 5, right: 5, minSeparation: 5, maxSeparation: 60, align: 3,
  atrPeriod: 14, minPriceAtr: 0.25, minRsiDelta: 1.5, minMacdAtr: 0.03, recentBars: 5,
};

// ---------------------------------------------------------------------------------------- indicators

/** Wilder RSI. rsi[i] is null until `period` price changes exist (i < period). */
export function wilderRsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  const val = (g: number, l: number) => (l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l));
  out[period] = val(gain, loss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = val(gain, loss);
  }
  return out;
}

/** EMA over a series that may start with nulls; seeded with the mean of the first n non-null values. */
export function ema(values: (number | null)[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  const k = 2 / (n + 1);
  let seed = 0, count = 0, prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) { if (prev != null) prev = null; count = 0; seed = 0; continue; } // a gap restarts the average
    if (prev == null) {
      seed += v; count++;
      if (count === n) { prev = seed / n; out[i] = prev; }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export interface MacdSeries { macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] }

export function macd(closes: number[], fast = 12, slow = 26, signal = 9): MacdSeries {
  const f = ema(closes, fast), s = ema(closes, slow);
  const line = closes.map((_, i) => (f[i] != null && s[i] != null ? f[i]! - s[i]! : null));
  const sig = ema(line, signal);
  const hist = line.map((m, i) => (m != null && sig[i] != null ? m - sig[i]! : null));
  return { macd: line, signal: sig, hist };
}

/** Wilder ATR; null until `period` true ranges exist. */
export function atr(bars: MBar[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  let a = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const tr = i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close));
    if (i < period) { a += tr; if (i === period - 1) { a /= period; out[i] = a; } continue; }
    a = (a * (period - 1) + tr) / period;
    out[i] = a;
  }
  return out;
}

export function sma(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

// ------------------------------------------------------------------------------------------- pivots

export interface SwingPivot {
  index: number;
  ts: string;
  type: "high" | "low";
  price: number;
  /** Bar at whose close the pivot became known (index + right). */
  confirmedIndex: number;
  confirmedTs: string;
}

/**
 * Fixed-window swing pivots: a pivot high's high is above the `left` highs before it and at least as
 * high as the `right` highs after it (ties go to the earlier bar). Lows mirror this.
 */
export function swingPivots(bars: MBar[], left = 5, right = 5): SwingPivot[] {
  const out: SwingPivot[] = [];
  for (let i = left; i + right < bars.length; i++) {
    const h = bars[i].high, l = bars[i].low;
    let isHigh = true, isLow = true;
    for (let j = i - left; j < i && (isHigh || isLow); j++) {
      if (bars[j].high >= h) isHigh = false;
      if (bars[j].low <= l) isLow = false;
    }
    for (let j = i + 1; j <= i + right && (isHigh || isLow); j++) {
      if (bars[j].high > h) isHigh = false;
      if (bars[j].low < l) isLow = false;
    }
    const c = i + right;
    if (isHigh) out.push({ index: i, ts: bars[i].ts, type: "high", price: h, confirmedIndex: c, confirmedTs: bars[c].ts });
    if (isLow) out.push({ index: i, ts: bars[i].ts, type: "low", price: l, confirmedIndex: c, confirmedTs: bars[c].ts });
  }
  return out;
}

// -------------------------------------------------------------------------------------- divergences

export type Indicator = "rsi" | "macd" | "hist";
export type DivergenceType = "regular_bullish" | "regular_bearish" | "hidden_bullish" | "hidden_bearish";
export type Direction = "bullish" | "bearish";
export type SignalStatus = "confirmed" | "developing";

export interface Divergence {
  id: string;
  type: DivergenceType;
  direction: Direction;
  indicator: Indicator;
  status: SignalStatus;
  first: { index: number; ts: string; price: number; value: number; valueIndex: number; valueTs: string };
  second: { index: number; ts: string; price: number; value: number; valueIndex: number; valueTs: string };
  priceChangePct: number;
  indicatorChange: number;
  /** Bar at whose close the divergence became known; for developing signals, the latest bar. */
  confirmedIndex: number;
  confirmedTs: string;
  /** 0–1: size of the disagreement relative to the thresholds, capped. Used for ranking, not odds. */
  quality: number;
}

export const DIVERGENCE_LABEL: Record<DivergenceType, string> = {
  regular_bullish: "Regular bullish divergence",
  regular_bearish: "Regular bearish divergence",
  hidden_bullish: "Hidden bullish divergence",
  hidden_bearish: "Hidden bearish divergence",
};
export const DIVERGENCE_MEANING: Record<DivergenceType, string> = {
  regular_bullish: "Potential bullish reversal: price made a lower low but momentum made a higher low.",
  regular_bearish: "Potential bearish reversal: price made a higher high but momentum made a lower high.",
  hidden_bullish: "Potential bullish continuation: price held a higher low while momentum pulled back further.",
  hidden_bearish: "Potential bearish continuation: price made a lower high while momentum recovered further.",
};

/** The indicator extreme within ±align bars of the pivot, never past `limit` (the confirmation bar). */
function extremeNear(series: (number | null)[], i: number, align: number, limit: number, kind: "high" | "low") {
  let best: { value: number; index: number } | null = null;
  for (let j = Math.max(0, i - align); j <= Math.min(i + align, limit); j++) {
    const v = series[j];
    if (v == null) continue;
    if (!best || (kind === "high" ? v > best.value : v < best.value)) best = { value: v, index: j };
  }
  return best;
}

function classify(kind: "high" | "low", priceUp: boolean, indUp: boolean): DivergenceType | null {
  if (kind === "low") {
    if (!priceUp && indUp) return "regular_bullish";
    if (priceUp && !indUp) return "hidden_bullish";
  } else {
    if (priceUp && !indUp) return "regular_bearish";
    if (!priceUp && indUp) return "hidden_bearish";
  }
  return null;
}

function compare(
  bars: MBar[], series: (number | null)[], indicator: Indicator, a: SwingPivot, b: SwingPivot, limit: number,
  atrAt: number | null, p: MomentumParams, status: SignalStatus,
): Divergence | null {
  const sep = b.index - a.index;
  if (sep < p.minSeparation || sep > p.maxSeparation) return null;
  const va = extremeNear(series, a.index, p.align, limit, a.type), vb = extremeNear(series, b.index, p.align, limit, b.type);
  if (!va || !vb || atrAt == null || !(atrAt > 0)) return null;
  const dPrice = b.price - a.price, dInd = vb.value - va.value;
  if (Math.abs(dPrice) < p.minPriceAtr * atrAt) return null;
  const minInd = indicator === "rsi" ? p.minRsiDelta : p.minMacdAtr * atrAt;
  if (Math.abs(dInd) < minInd) return null;
  const type = classify(a.type, dPrice > 0, dInd > 0);
  if (!type) return null;
  // the second swing must be the extreme between the two pivots, or the comparison isn't like for like
  for (let j = a.index + 1; j < b.index; j++) {
    if (a.type === "low" ? bars[j].low < Math.min(a.price, b.price) : bars[j].high > Math.max(a.price, b.price)) return null;
  }
  // each side counts fully once the move is four times its minimum threshold
  const quality = 0.5 * Math.min(1, Math.abs(dPrice) / (4 * p.minPriceAtr * atrAt)) + 0.5 * Math.min(1, Math.abs(dInd) / (4 * minInd));
  return {
    id: `${indicator}:${type}:${a.ts.slice(0, 16)}>${b.ts.slice(0, 16)}`,
    type, direction: type.endsWith("bullish") ? "bullish" : "bearish", indicator, status,
    first: { index: a.index, ts: a.ts, price: a.price, value: va.value, valueIndex: va.index, valueTs: bars[va.index].ts },
    second: { index: b.index, ts: b.ts, price: b.price, value: vb.value, valueIndex: vb.index, valueTs: bars[vb.index].ts },
    priceChangePct: dPrice / a.price,
    indicatorChange: dInd,
    confirmedIndex: limit, confirmedTs: bars[limit].ts,
    quality: Math.round(quality * 100) / 100,
  };
}

/**
 * Confirmed divergences, found as each pivot is confirmed: the new pivot is compared with the
 * previous confirmed pivot of the same type. Each pair is reported once, at its confirmation bar.
 */
export function divergences(bars: MBar[], pivots: SwingPivot[], series: Record<Indicator, (number | null)[]>, atrs: (number | null)[], p: MomentumParams): Divergence[] {
  const out: Divergence[] = [];
  const byConfirm = [...pivots].sort((x, y) => x.confirmedIndex - y.confirmedIndex || x.index - y.index);
  const last: Record<"high" | "low", SwingPivot | null> = { high: null, low: null };
  for (const pv of byConfirm) {
    const prev = last[pv.type];
    if (prev) for (const ind of ["rsi", "macd", "hist"] as Indicator[]) {
      const d = compare(bars, series[ind], ind, prev, pv, pv.confirmedIndex, atrs[pv.confirmedIndex], p, "confirmed");
      if (d) out.push(d);
    }
    last[pv.type] = pv;
  }
  return out;
}

/**
 * A provisional swing at the right edge: the most extreme bar of the last `right` bars, if it beats
 * the `left` bars before it. It may still be revised, so anything built on it is "developing".
 */
function provisionalPivots(bars: MBar[], left: number, right: number): SwingPivot[] {
  const n = bars.length, out: SwingPivot[] = [];
  if (n < left + 2) return out;
  const from = Math.max(left, n - right);
  for (const type of ["high", "low"] as const) {
    let k = -1;
    for (let i = from; i < n; i++) {
      if (k < 0 || (type === "high" ? bars[i].high > bars[k].high : bars[i].low < bars[k].low)) k = i;
    }
    if (k < 0) continue;
    let ok = true;
    for (let j = k - left; j < k && ok; j++) ok = type === "high" ? bars[j].high < bars[k].high : bars[j].low > bars[k].low;
    for (let j = k + 1; j < n && ok; j++) ok = type === "high" ? bars[j].high <= bars[k].high : bars[j].low >= bars[k].low;
    if (ok) out.push({ index: k, ts: bars[k].ts, type, price: type === "high" ? bars[k].high : bars[k].low, confirmedIndex: n - 1, confirmedTs: bars[n - 1].ts });
  }
  return out;
}

// --------------------------------------------------------------------------------------- crossovers

export type CrossKind =
  | "macd_signal_up" | "macd_signal_down" | "macd_zero_up" | "macd_zero_down"
  | "rsi_30_up" | "rsi_30_down" | "rsi_50_up" | "rsi_50_down" | "rsi_70_up" | "rsi_70_down";

export interface Crossover {
  id: string;
  kind: CrossKind;
  direction: Direction;
  indicator: "rsi" | "macd";
  index: number;
  ts: string;
  value: number;
  status: SignalStatus;
}

export const CROSS_LABEL: Record<CrossKind, string> = {
  macd_signal_up: "Bullish MACD crossover", macd_signal_down: "Bearish MACD crossover",
  macd_zero_up: "MACD crossed above zero", macd_zero_down: "MACD crossed below zero",
  rsi_30_up: "RSI crossed above 30 (recovery)", rsi_30_down: "RSI crossed below 30 (oversold)",
  rsi_50_up: "RSI crossed above 50", rsi_50_down: "RSI crossed below 50",
  rsi_70_up: "RSI crossed above 70 (overbought)", rsi_70_down: "RSI crossed below 70 (momentum warning)",
};

function crossovers(bars: MBar[], rsi: (number | null)[], m: MacdSeries, lastOpen: boolean): Crossover[] {
  const out: Crossover[] = [];
  const n = bars.length;
  const push = (kind: CrossKind, indicator: "rsi" | "macd", i: number, value: number) => {
    const direction: Direction = kind.endsWith("_up") ? "bullish" : "bearish";
    out.push({ id: `${kind}:${bars[i].ts.slice(0, 16)}`, kind, direction, indicator, index: i, ts: bars[i].ts, value, status: lastOpen && i === n - 1 ? "developing" : "confirmed" });
  };
  for (let i = 1; i < n; i++) {
    const a = m.macd[i - 1], b = m.macd[i], sa = m.signal[i - 1], sb = m.signal[i];
    if (a != null && b != null && sa != null && sb != null) {
      if (a <= sa && b > sb) push("macd_signal_up", "macd", i, b);
      if (a >= sa && b < sb) push("macd_signal_down", "macd", i, b);
    }
    if (a != null && b != null) {
      if (a <= 0 && b > 0) push("macd_zero_up", "macd", i, b);
      if (a >= 0 && b < 0) push("macd_zero_down", "macd", i, b);
    }
    const r0 = rsi[i - 1], r1 = rsi[i];
    if (r0 != null && r1 != null) for (const lvl of [30, 50, 70] as const) {
      if (r0 <= lvl && r1 > lvl) push(`rsi_${lvl}_up`, "rsi", i, r1);
      if (r0 >= lvl && r1 < lvl) push(`rsi_${lvl}_down`, "rsi", i, r1);
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------- states

export type RsiState = "oversold" | "recovering_from_oversold" | "negative" | "positive" | "overbought" | "falling_from_overbought" | "unavailable";
export type HistState = "expanding_positive" | "contracting_positive" | "expanding_negative" | "contracting_negative" | "flat" | "unavailable";

export const RSI_STATE_LABEL: Record<RsiState, string> = {
  oversold: "Oversold (below 30)", recovering_from_oversold: "Recovering from oversold", negative: "Negative momentum (30–50)",
  positive: "Positive momentum (50–70)", overbought: "Overbought (above 70)", falling_from_overbought: "Falling from overbought", unavailable: "Not enough history",
};
export const HIST_STATE_LABEL: Record<HistState, string> = {
  expanding_positive: "Positive and expanding: bullish momentum strengthening",
  contracting_positive: "Positive but contracting: bullish momentum weakening",
  expanding_negative: "Negative and expanding: bearish momentum strengthening",
  contracting_negative: "Negative but contracting: bearish momentum weakening",
  flat: "Flat", unavailable: "Not enough history",
};

function rsiState(rsi: (number | null)[], recent: number): RsiState {
  const n = rsi.length, v = rsi[n - 1];
  if (v == null) return "unavailable";
  if (v < 30) return "oversold";
  if (v > 70) return "overbought";
  const window = rsi.slice(Math.max(0, n - 1 - recent), n - 1).filter((x): x is number => x != null);
  if (window.some((x) => x < 30)) return "recovering_from_oversold";
  if (window.some((x) => x > 70)) return "falling_from_overbought";
  return v >= 50 ? "positive" : "negative";
}

function histState(h: (number | null)[]): HistState {
  const a = h[h.length - 2], b = h[h.length - 1];
  if (a == null || b == null) return "unavailable";
  if (b === a) return "flat";
  if (b >= 0) return Math.abs(b) > Math.abs(a) && a >= 0 ? "expanding_positive" : "contracting_positive";
  return Math.abs(b) > Math.abs(a) && a <= 0 ? "expanding_negative" : "contracting_negative";
}

// -------------------------------------------------------------------------------------------- main

export interface MomentumResult {
  version: string;
  params: MomentumParams;
  bars: number;
  lastTs: string | null;
  series: { rsi: (number | null)[]; macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[]; atr: (number | null)[] };
  pivots: SwingPivot[];
  divergences: Divergence[];
  developing: Divergence[];
  crossovers: Crossover[];
  state: {
    rsi: number | null;
    rsiState: RsiState;
    macd: number | null;
    signal: number | null;
    hist: number | null;
    histState: HistState;
    macdAboveSignal: boolean | null;
    macdAboveZero: boolean | null;
    /** Bars since the last MACD signal-line crossover, with its direction. */
    lastMacdCross: { direction: Direction; barsAgo: number; ts: string } | null;
  };
}

/**
 * Full momentum analysis for one symbol and timeframe. `lastBarOpen` marks the final bar as still
 * forming (an intraday session in progress): events on it are reported as developing.
 */
export function analyzeMomentum(bars: MBar[], opts: Partial<MomentumParams> & { lastBarOpen?: boolean } = {}): MomentumResult {
  const { lastBarOpen = false, ...rest } = opts;
  const p: MomentumParams = { ...DEFAULT_MOMENTUM_PARAMS, ...rest };
  const closes = bars.map((b) => b.close);
  const rsi = wilderRsi(closes, p.rsiPeriod);
  const m = macd(closes, p.fast, p.slow, p.signal);
  const atrs = atr(bars, p.atrPeriod);
  const series = { rsi, macd: m.macd, hist: m.hist };

  // a forming last bar can't confirm a pivot
  const usable = lastBarOpen ? bars.slice(0, -1) : bars;
  const pivots = swingPivots(usable, p.left, p.right);
  const confirmed = divergences(bars, pivots, series, atrs, p);

  // developing: the latest provisional swing against the last confirmed swing of the same type
  const developing: Divergence[] = [];
  const n = bars.length;
  if (n) {
    for (const pv of provisionalPivots(bars, p.left, p.right)) {
      const prev = [...pivots].reverse().find((x) => x.type === pv.type && x.index < pv.index);
      if (!prev || pivots.some((x) => x.index === pv.index && x.type === pv.type)) continue;
      for (const ind of ["rsi", "macd", "hist"] as Indicator[]) {
        const d = compare(bars, series[ind], ind, prev, pv, n - 1, atrs[n - 1], p, "developing");
        if (d) developing.push(d);
      }
    }
  }

  const crosses = crossovers(bars, rsi, m, lastBarOpen);
  const last = n - 1;
  const lastCross = [...crosses].reverse().find((c) => c.kind === "macd_signal_up" || c.kind === "macd_signal_down") ?? null;
  const at = <T,>(s: (T | null)[]) => (n ? s[last] ?? null : null);
  return {
    version: MOMENTUM_VERSION, params: p, bars: n, lastTs: bars[last]?.ts ?? null,
    series: { rsi, macd: m.macd, signal: m.signal, hist: m.hist, atr: atrs },
    pivots, divergences: confirmed, developing, crossovers: crosses,
    state: {
      rsi: at(rsi), rsiState: rsiState(rsi, p.recentBars),
      macd: at(m.macd), signal: at(m.signal), hist: at(m.hist), histState: histState(m.hist),
      macdAboveSignal: at(m.macd) != null && at(m.signal) != null ? at(m.macd)! > at(m.signal)! : null,
      macdAboveZero: at(m.macd) != null ? at(m.macd)! > 0 : null,
      lastMacdCross: lastCross ? { direction: lastCross.direction, barsAgo: last - lastCross.index, ts: lastCross.ts } : null,
    },
  };
}
