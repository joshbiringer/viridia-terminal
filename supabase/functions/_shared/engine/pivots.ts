/**
 * Viridia engine, Phase 3: adaptive pivot detection.
 *
 * Pure TypeScript with no runtime dependencies. The same file runs in the Next.js app (Node), the
 * analysis-worker Edge Function (Deno) and the unit tests, so every surface computes identical pivots.
 *
 * Method: a causal ZigZag whose reversal threshold adapts to volatility.
 *   threshold(bar) = max(floor[timeframe] × degreeFactor, atrMultiple[degree] × ATR14(bar) / close(bar))
 * A swing extreme becomes a pivot only when price has reversed from it by at least the threshold
 * (measured on the bar's high/low), on a later bar than the extreme itself. The bar on which that
 * happens is recorded as the pivot's confirmation bar.
 *
 * No look-ahead: bars are processed strictly in order, and a pivot is never revised after it is
 * confirmed. Everything about a pivot except its right-hand prominence depends only on bars up to its
 * confirmation bar, so running the detector on bars[0..t] yields exactly the pivots of the full run
 * whose confirmation bar is ≤ t. tests/pivots.test.ts checks this on thousands of random series.
 */

export const PIVOT_ALGORITHM_VERSION = "pivots-1.0.0";

export type Timeframe = "1h" | "4h" | "1d" | "1w" | "1mo";
export type Degree = "minor" | "intermediate" | "primary";
export const DEGREES: Degree[] = ["minor", "intermediate", "primary"];

export interface PivotBar {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Pivot {
  /** Position of the pivot bar in the input array. */
  index: number;
  ts: string;
  price: number;
  type: "high" | "low";
  timeframe: Timeframe;
  degree: Degree;
  /** Bar on which the reversal reached the threshold, i.e. when the pivot became knowable. */
  confirmedIndex: number;
  confirmedTs: string;
  /** Size of the swing that ended at this pivot (from the previous pivot). Null for the first pivot. */
  magnitude: { price: number; pct: number; atr: number } | null;
  /**
   * The smaller of the swing into and the swing out of this pivot. `final` is false while the
   * swing out is still developing; it then measures to the most extreme price seen so far.
   */
  prominence: { pct: number; atr: number; final: boolean } | null;
  /** ATR(14) at the pivot bar, in price units. */
  atr: number;
  /** Reversal threshold (fraction of price) in force on the confirmation bar. */
  threshold: number;
}

/** The swing currently in progress: its most extreme price so far, not yet a confirmed pivot. */
export interface PendingSwing {
  direction: "up" | "down";
  index: number;
  ts: string;
  price: number;
  /** Reversal from `price` needed on the latest bar to confirm it. */
  threshold: number;
}

export interface PivotParams {
  atrPeriod: number;
  atrMultiple: number;
  floorPct: number;
  minSeparation: number;
}

export interface PivotSeries {
  timeframe: Timeframe;
  degree: Degree;
  params: PivotParams;
  pivots: Pivot[];
  pending: PendingSwing | null;
}

export interface PivotAnalysis {
  version: string;
  timeframe: Timeframe;
  bars: number;
  firstTs: string | null;
  lastTs: string | null;
  degrees: Record<Degree, PivotSeries>;
}

/** Percentage floors per timeframe (minor degree). Larger timeframes move further per bar. */
const FLOOR: Record<Timeframe, number> = { "1h": 0.006, "4h": 0.01, "1d": 0.02, "1w": 0.04, "1mo": 0.06 };
const DEGREE_FACTOR: Record<Degree, number> = { minor: 1, intermediate: 2, primary: 4 };
const ATR_MULTIPLE: Record<Degree, number> = { minor: 1.5, intermediate: 3, primary: 6 };
const MIN_SEPARATION: Record<Timeframe, number> = { "1h": 3, "4h": 2, "1d": 3, "1w": 2, "1mo": 1 };

export function defaultParams(timeframe: Timeframe, degree: Degree): PivotParams {
  const f = DEGREE_FACTOR[degree];
  return {
    atrPeriod: 14,
    atrMultiple: ATR_MULTIPLE[degree],
    floorPct: FLOOR[timeframe] * f,
    minSeparation: MIN_SEPARATION[timeframe] * Math.min(f, 3),
  };
}

/**
 * Wilder ATR. Value i uses bars 0..i only. Before `period` true ranges exist it is their simple mean,
 * so early thresholds are available but noisier (the percentage floor bounds them).
 */
export function atrSeries(bars: PivotBar[], period = 14): number[] {
  const out: number[] = new Array(bars.length);
  let atr = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const tr = i === 0 ? b.high - b.low
      : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close));
    atr = i < period ? (atr * i + tr) / (i + 1) : (atr * (period - 1) + tr) / period;
    out[i] = atr;
  }
  return out;
}

interface Point { index: number; price: number }

export function detectPivots(
  bars: PivotBar[], timeframe: Timeframe, degree: Degree, params: PivotParams = defaultParams(timeframe, degree),
): PivotSeries {
  const atr = atrSeries(bars, params.atrPeriod);
  const thr = (i: number) => {
    const c = bars[i].close;
    return Math.max(params.floorPct, c > 0 ? (params.atrMultiple * atr[i]) / c : 0);
  };

  type Raw = { index: number; price: number; type: "high" | "low"; confirmedIndex: number; threshold: number };
  const raw: Raw[] = [];
  let dir: 0 | 1 | -1 = 0; // 1: tracking a high (last pivot was a low); -1: tracking a low
  let hi: Point | null = null, lo: Point | null = null; // initial extremes before the first pivot
  let cand: Point | null = null;

  /** The most extreme high (or low) strictly after pivot bar `from`, up to and including bar `to`. */
  const extreme = (from: number, to: number, kind: "high" | "low"): Point => {
    let best: Point | null = null;
    for (let j = from + 1; j <= to; j++) {
      const b = bars[j];
      if (!(b.high >= b.low) || !(b.low > 0)) continue;
      const v = kind === "high" ? b.high : b.low;
      if (!best || (kind === "high" ? v > best.price : v < best.price)) best = { index: j, price: v };
    }
    return best!;
  };

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (!(b.high >= b.low) || !(b.low > 0)) continue; // skip malformed bars
    const t = thr(i);

    if (dir === 0) {
      if (!hi || b.high > hi.price) hi = { index: i, price: b.high };
      if (!lo || b.low < lo.price) lo = { index: i, price: b.low };
      const fromHigh = hi.index < i && b.low <= hi.price * (1 - t);
      const fromLow = lo.index < i && b.high >= lo.price * (1 + t);
      if (fromHigh || fromLow) {
        // If one bar reverses both ways, the older extreme is the first pivot.
        const highFirst = fromHigh && (!fromLow || hi.index <= lo.index);
        if (highFirst) {
          raw.push({ index: hi.index, price: hi.price, type: "high", confirmedIndex: i, threshold: t });
          dir = -1; cand = extreme(hi.index, i, "low");
        } else {
          raw.push({ index: lo.index, price: lo.price, type: "low", confirmedIndex: i, threshold: t });
          dir = 1; cand = extreme(lo.index, i, "high");
        }
      }
      continue;
    }

    const last = raw[raw.length - 1];
    if (dir === 1) {
      if (b.high > cand!.price) cand = { index: i, price: b.high };
      const reversed = b.low <= cand!.price * (1 - t);
      const broke = b.low < last.price; // the swing up has been fully retraced
      const spaced = cand!.index - last.index >= params.minSeparation;
      if (cand!.index < i && ((reversed && spaced) || broke)) {
        raw.push({ index: cand!.index, price: cand!.price, type: "high", confirmedIndex: i, threshold: t });
        dir = -1; cand = extreme(cand!.index, i, "low");
      }
    } else {
      if (b.low < cand!.price) cand = { index: i, price: b.low };
      const reversed = b.high >= cand!.price * (1 + t);
      const broke = b.high > last.price;
      const spaced = cand!.index - last.index >= params.minSeparation;
      if (cand!.index < i && ((reversed && spaced) || broke)) {
        raw.push({ index: cand!.index, price: cand!.price, type: "low", confirmedIndex: i, threshold: t });
        dir = 1; cand = extreme(cand!.index, i, "high");
      }
    }
  }

  const pending: PendingSwing | null = dir === 0 || !cand ? null : {
    direction: dir === 1 ? "up" : "down",
    index: cand.index, ts: bars[cand.index].ts, price: cand.price,
    threshold: thr(bars.length - 1),
  };

  const pivots: Pivot[] = raw.map((p, k) => {
    const prev = raw[k - 1];
    const a = atr[p.index] || 0;
    const magnitude = prev ? {
      price: Math.abs(p.price - prev.price),
      pct: Math.abs(p.price - prev.price) / prev.price,
      atr: a > 0 ? Math.abs(p.price - prev.price) / a : 0,
    } : null;
    const nextPrice = raw[k + 1]?.price ?? pending?.price;
    let prominence: Pivot["prominence"] = null;
    if (magnitude && nextPrice != null) {
      const right = Math.abs(p.price - nextPrice);
      const m = Math.min(magnitude.price, right);
      prominence = { pct: m / p.price, atr: a > 0 ? m / a : 0, final: k + 1 < raw.length };
    }
    return {
      index: p.index, ts: bars[p.index].ts, price: p.price, type: p.type, timeframe, degree,
      confirmedIndex: p.confirmedIndex, confirmedTs: bars[p.confirmedIndex].ts,
      magnitude, prominence, atr: a, threshold: p.threshold,
    };
  });

  return { timeframe, degree, params, pivots, pending };
}

/** Pivots at all three degrees for one bar series. */
export function analyzePivots(bars: PivotBar[], timeframe: Timeframe): PivotAnalysis {
  const degrees = Object.fromEntries(DEGREES.map((d) => [d, detectPivots(bars, timeframe, d)])) as Record<Degree, PivotSeries>;
  return {
    version: PIVOT_ALGORITHM_VERSION, timeframe, bars: bars.length,
    firstTs: bars[0]?.ts ?? null, lastTs: bars.at(-1)?.ts ?? null, degrees,
  };
}

export type SwingStructure = "higher_highs_lows" | "lower_highs_lows" | "expanding" | "contracting" | "insufficient";

export const SWING_LABEL: Record<SwingStructure, string> = {
  higher_highs_lows: "Higher highs, higher lows",
  lower_highs_lows: "Lower highs, lower lows",
  expanding: "Expanding range",
  contracting: "Contracting range",
  insufficient: "Not enough swings",
};

/** Classifies the last two confirmed highs and lows (Dow-style swing structure). */
export function swingStructure(pivots: Pivot[]): { structure: SwingStructure; highs: Pivot[]; lows: Pivot[] } {
  const highs = pivots.filter((p) => p.type === "high").slice(-2);
  const lows = pivots.filter((p) => p.type === "low").slice(-2);
  if (highs.length < 2 || lows.length < 2) return { structure: "insufficient", highs, lows };
  const hh = highs[1].price > highs[0].price, hl = lows[1].price > lows[0].price;
  const structure: SwingStructure = hh && hl ? "higher_highs_lows" : !hh && !hl ? "lower_highs_lows" : hh ? "expanding" : "contracting";
  return { structure, highs, lows };
}

/** Compact form stored in analysis_results.pivots_json (keeps the cache small). */
export interface CompactPivot { t: string; p: number; k: "H" | "L"; c: string; m: number | null; ma: number | null; pr: number | null; pa: number | null; f: boolean }

export function compact(p: Pivot): CompactPivot {
  const r = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
  return {
    t: p.ts, p: p.price, k: p.type === "high" ? "H" : "L", c: p.confirmedTs,
    m: p.magnitude ? r(p.magnitude.pct) : null, ma: p.magnitude ? r(p.magnitude.atr, 2) : null,
    pr: p.prominence ? r(p.prominence.pct) : null, pa: p.prominence ? r(p.prominence.atr, 2) : null,
    f: p.prominence?.final ?? false,
  };
}
