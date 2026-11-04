/**
 * Viridia engine: unified technical confluence.
 *
 * One analysis over one OHLCV series combines five layers:
 *   1. Elliott Wave structure (the ranked, rule-valid counts from candidates/rank)
 *   2. Fibonacci (confluence zones and the typical retracement bands for the wave in progress)
 *   3. RSI momentum and divergence     (momentum.ts)
 *   4. MACD momentum and divergence    (momentum.ts)
 *   5. Price action (swing structure, moving-average trend, breaks of structure, volume, ATR)
 *
 * Each layer scores −1 (bearish) … +1 (bullish) from documented rules; the layers are weighted
 * 30/20/15/15/20 into a technical alignment index from −100 to +100. The weights are preliminary
 * product assumptions, not fitted, and the index is not a probability, an expected return or a
 * recommendation. RSI and MACD are both functions of price, so the same divergence seen by both
 * is counted once in full and once at half weight, and when the two layers agree the smaller one is
 * scaled down (see `redundancy`).
 *
 * Scenarios A (wave 3 setup), B (wave 5 exhaustion) and C (ABC completion) are tested against the
 * preferred count at the chosen degree, with confirmation and invalidation levels taken from the
 * count's own pivots. Nothing here predicts; it reports which conditions currently hold.
 */
import type { CompactCandidate, CompactCandidateSet } from "./candidates.ts";
import type { ConfluenceZone } from "./fib.ts";
import { alternateIndex } from "./rank.ts";
import { compactScenario } from "./glance.ts";
import { DIVERGENCE_LABEL, sma, type Divergence, type MBar, type MomentumResult } from "./momentum.ts";

export const CONFLUENCE_VERSION = "confluence-1.0.0";

export const WEIGHTS = { wave: 0.3, fib: 0.2, rsi: 0.15, macd: 0.15, price: 0.2 } as const;
export type ComponentKey = keyof typeof WEIGHTS;
export const COMPONENT_LABEL: Record<ComponentKey, string> = {
  wave: "Elliott Wave structure", fib: "Fibonacci confluence", rsi: "RSI momentum", macd: "MACD momentum", price: "Price action and trend",
};

export type Lean = "bullish" | "bearish" | "neutral";
export interface Evidence { text: string; lean: Lean; component: ComponentKey; weight: number }

export interface Component {
  key: ComponentKey;
  label: string;
  weight: number;
  /** −1 … +1, positive bullish. */
  score: number;
  /** weight × score × 100: this component's share of the index. */
  contribution: number;
  evidence: Evidence[];
  available: boolean;
}

export type ConfluenceClass = "strong_bullish" | "moderate_bullish" | "neutral" | "moderate_bearish" | "strong_bearish";
export const CLASS_LABEL: Record<ConfluenceClass, string> = {
  strong_bullish: "Strong bullish confluence", moderate_bullish: "Moderate bullish confluence", neutral: "Neutral / mixed",
  moderate_bearish: "Moderate bearish confluence", strong_bearish: "Strong bearish confluence",
};
export const classOf = (index: number): ConfluenceClass =>
  index >= 50 ? "strong_bullish" : index >= 20 ? "moderate_bullish" : index > -20 ? "neutral" : index > -50 ? "moderate_bearish" : "strong_bearish";

// ------------------------------------------------------------------------------------- price action

export type Structure = "higher_highs_lows" | "lower_highs_lows" | "mixed" | "insufficient";
export interface PriceAction {
  structure: Structure;
  maTrend: "up" | "down" | "mixed" | "insufficient";
  maPeriods: [number, number];
  maFast: number | null;
  maSlow: number | null;
  atr: number | null;
  atrPct: number | null;
  breakOfStructure: { direction: "bullish" | "bearish"; ts: string; index: number; level: number; barsAgo: number } | null;
  volume: { ratio: number; upShare: number } | null;
  support: { price: number; ts: string } | null;
  resistance: { price: number; ts: string } | null;
}

export function priceAction(bars: MBar[], m: MomentumResult): PriceAction {
  const n = bars.length, last = n - 1;
  const close = bars[last]?.close ?? NaN;
  const piv = m.pivots;
  const highs = piv.filter((p) => p.type === "high").slice(-2), lows = piv.filter((p) => p.type === "low").slice(-2);
  const structure: Structure = highs.length < 2 || lows.length < 2 ? "insufficient"
    : highs[1].price > highs[0].price && lows[1].price > lows[0].price ? "higher_highs_lows"
    : highs[1].price < highs[0].price && lows[1].price < lows[0].price ? "lower_highs_lows" : "mixed";

  const periods: [number, number] = n >= 220 ? [50, 200] : [20, 50];
  const closes = bars.map((b) => b.close);
  const f = sma(closes, periods[0])[last] ?? null, s = sma(closes, periods[1])[last] ?? null;
  const fPrev = sma(closes, periods[0])[Math.max(0, last - 5)] ?? null;
  const maTrend = f == null || s == null ? "insufficient"
    : close > f && f > s && (fPrev == null || f >= fPrev) ? "up"
    : close < f && f < s && (fPrev == null || f <= fPrev) ? "down" : "mixed";

  // break of structure: the first close beyond the latest pivot already confirmed at that bar
  let bos: PriceAction["breakOfStructure"] = null;
  const byConf = [...piv].sort((a, b) => a.confirmedIndex - b.confirmedIndex);
  let k = 0, lastHigh: (typeof piv)[number] | null = null, lastLow: (typeof piv)[number] | null = null;
  let brokeHigh = false, brokeLow = false;
  for (let i = 0; i < n; i++) {
    while (k < byConf.length && byConf[k].confirmedIndex < i) {
      const pv = byConf[k++];
      if (pv.type === "high") { lastHigh = pv; brokeHigh = false; } else { lastLow = pv; brokeLow = false; }
    }
    if (lastHigh && !brokeHigh && bars[i].close > lastHigh.price) { brokeHigh = true; bos = { direction: "bullish", ts: bars[i].ts, index: i, level: lastHigh.price, barsAgo: last - i }; }
    if (lastLow && !brokeLow && bars[i].close < lastLow.price) { brokeLow = true; bos = { direction: "bearish", ts: bars[i].ts, index: i, level: lastLow.price, barsAgo: last - i }; }
  }

  let volume: PriceAction["volume"] = null;
  if (n >= 70 && bars.slice(-70).every((b) => (b.volume ?? 0) > 0)) {
    const v20 = bars.slice(-20), v50 = bars.slice(-70, -20);
    const avg = (xs: MBar[]) => xs.reduce((a, b) => a + (b.volume ?? 0), 0) / xs.length;
    const up = v20.filter((b) => b.close >= b.open).reduce((a, b) => a + (b.volume ?? 0), 0);
    volume = { ratio: avg(v20) / avg(v50), upShare: up / v20.reduce((a, b) => a + (b.volume ?? 0), 0) };
  }

  const a = m.series.atr[last] ?? null;
  const below = piv.filter((p) => p.type === "low" && p.price < close).slice(-8).sort((x, y) => y.price - x.price)[0];
  const above = piv.filter((p) => p.type === "high" && p.price > close).slice(-8).sort((x, y) => x.price - y.price)[0];
  return {
    structure, maTrend, maPeriods: periods, maFast: f, maSlow: s, atr: a, atrPct: a != null && close > 0 ? a / close : null,
    breakOfStructure: bos, volume,
    support: below ? { price: below.price, ts: below.ts } : null,
    resistance: above ? { price: above.price, ts: above.ts } : null,
  };
}

// ------------------------------------------------------------------------------------------ scoring

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const px = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(2) : Math.abs(x) >= 1 ? x.toFixed(2) : x.toPrecision(3));
const WAVE_NAME: Record<string, string> = { impulse: "impulse", leading_diagonal: "leading diagonal", ending_diagonal: "ending diagonal", zigzag: "zigzag", flat: "flat", triangle: "triangle" };

export interface Inputs {
  bars: MBar[];
  momentum: MomentumResult;
  /** Ranked counts for this degree (computeAnalysis().candidate_counts_json[degree]). */
  counts: CompactCandidateSet | null;
  zones: ConfluenceZone[];
  degree: string;
}

function preferredPair(set: CompactCandidateSet | null) {
  const c = set?.c ?? [];
  if (!c.length) return { pref: null, alt: null };
  const ai = alternateIndex(c, compactScenario);
  return { pref: c[0], alt: ai > 0 ? c[ai] : null };
}

function waveComponent(set: CompactCandidateSet | null): Component {
  const ev: Evidence[] = [];
  const { pref, alt } = preferredPair(set);
  if (!pref) return { key: "wave", label: COMPONENT_LABEL.wave, weight: WEIGHTS.wave, score: 0, contribution: 0, evidence: [{ text: "No rule-valid wave count at this degree.", lean: "neutral", component: "wave", weight: 0 }], available: false };
  const dir = pref.nx.d === "u" ? 1 : -1;
  const sc = pref.sc ?? 50;
  let strength = clamp((sc - 40) / 40, 0.15, 1);
  const what = pref.c ? `a completed ${WAVE_NAME[pref.pt]} ${pref.d === "u" ? "up" : "down"}, so the next move is expected ${pref.nx.d === "u" ? "up" : "down"}`
    : `${WAVE_NAME[pref.pt]} ${pref.d === "u" ? "up" : "down"}, wave ${pref.nx.l} in progress ${pref.nx.d === "u" ? "up" : "down"}`;
  ev.push({ text: `Preferred count: ${what} (Pattern Confidence ${sc}).`, lean: dir > 0 ? "bullish" : "bearish", component: "wave", weight: strength });
  if (alt) {
    const opposite = alt.nx.d !== pref.nx.d, close = sc - (alt.sc ?? 50) < 5;
    if (opposite && close) {
      strength *= 0.35;
      ev.push({ text: `The alternate count (${WAVE_NAME[alt.pt]}, Pattern Confidence ${alt.sc ?? 50}) expects the opposite direction and scores within 5 points: a close call.`, lean: alt.nx.d === "u" ? "bullish" : "bearish", component: "wave", weight: 0.65 });
    } else if (opposite) {
      strength *= 0.8;
      ev.push({ text: `The alternate count expects the opposite direction (Pattern Confidence ${alt.sc ?? 50}).`, lean: alt.nx.d === "u" ? "bullish" : "bearish", component: "wave", weight: 0.2 });
    } else {
      ev.push({ text: "The alternate count expects the same direction.", lean: dir > 0 ? "bullish" : "bearish", component: "wave", weight: 0.1 });
    }
  }
  const score = dir * strength;
  return { key: "wave", label: COMPONENT_LABEL.wave, weight: WEIGHTS.wave, score, contribution: score * WEIGHTS.wave * 100, evidence: ev, available: true };
}

/** Typical retracement bands for the correction just completed or in progress. */
const BANDS: Record<string, { core: [number, number]; wide: [number, number]; name: string }> = {
  "2": { core: [0.5, 0.618], wide: [0.382, 0.786], name: "wave 2" },
  "4": { core: [0.236, 0.382], wide: [0.146, 0.5], name: "wave 4" },
  B: { core: [0.5, 0.618], wide: [0.382, 0.786], name: "wave B" },
};

function fibComponent(inp: Inputs, pa: PriceAction): Component {
  const ev: Evidence[] = [];
  const close = inp.bars.at(-1)!.close;
  const a = pa.atr ?? close * 0.02;
  let s = 0;
  // nearest unreached zone within 1.5 ATR
  const near = inp.zones.map((z) => ({ z, d: close >= z.low && close <= z.high ? 0 : Math.min(Math.abs(close - z.low), Math.abs(close - z.high)) }))
    .filter((x) => x.d <= 1.5 * a).sort((x, y) => x.d - y.d)[0];
  if (near) {
    const support = near.z.mid <= close;
    const prox = 1 - near.d / (1.5 * a);
    const w = Math.min(1, 0.4 + near.z.count * 0.15) * prox;
    s += (support ? 1 : -1) * 0.6 * w;
    ev.push({ text: `Price is ${near.d === 0 ? "inside" : `${px(near.d)} from`} a ${near.z.count}-level Fibonacci zone at ${px(near.z.low)}–${px(near.z.high)}, acting as ${support ? "support below" : "resistance above"}.`, lean: support ? "bullish" : "bearish", component: "fib", weight: w });
  } else if (inp.zones.length) {
    ev.push({ text: "No Fibonacci confluence zone within 1.5 ATR of price.", lean: "neutral", component: "fib", weight: 0 });
  }
  // the correction just finished (wave 2, 4 or B is the last labeled leg) measured against its band
  const { pref } = preferredPair(inp.counts);
  if (pref && !pref.c) {
    const k = pref.p.length - 1;
    const doneLabel = pref.pt === "zigzag" || pref.pt === "flat" ? ["A", "B", "C"][k - 1] : String(k);
    const band = BANDS[doneLabel];
    if (band && k >= 2) {
      const [s0, s1, s2] = [pref.p[k - 2][1], pref.p[k - 1][1], pref.p[k][1]];
      const r = Math.abs(s2 - s1) / Math.abs(s1 - s0);
      const inCore = r >= band.core[0] * 0.97 && r <= band.core[1] * 1.03, inWide = r >= band.wide[0] && r <= band.wide[1];
      const resume = pref.nx.d === "u" ? 1 : -1;
      if (inCore || inWide) {
        const w = inCore ? 0.5 : 0.25;
        s += resume * w;
        ev.push({ text: `${band.name[0].toUpperCase()}${band.name.slice(1)} retraced ${pct(r)}, ${inCore ? "inside" : "near"} its typical ${pct(band.core[0])}–${pct(band.core[1])} band.`, lean: resume > 0 ? "bullish" : "bearish", component: "fib", weight: w });
      } else {
        ev.push({ text: `${band.name[0].toUpperCase()}${band.name.slice(1)} retraced ${pct(r)}, outside its typical ${pct(band.core[0])}–${pct(band.core[1])} band.`, lean: "neutral", component: "fib", weight: 0 });
      }
    }
  }
  const score = clamp(s);
  return { key: "fib", label: COMPONENT_LABEL.fib, weight: WEIGHTS.fib, score, contribution: score * WEIGHTS.fib * 100, evidence: ev, available: inp.zones.length > 0 || !!pref };
}

const RECENT = 30;
function divergenceTerm(m: MomentumResult, inds: Divergence["indicator"][], counted: Set<string>, comp: ComponentKey, ev: Evidence[]) {
  const last = m.bars - 1;
  const pool = [...m.divergences, ...m.developing].filter((d) => inds.includes(d.indicator) && last - d.confirmedIndex <= RECENT);
  if (!pool.length) return 0;
  const value = (d: Divergence) => (d.type.startsWith("regular") ? 0.6 : 0.4) * (0.5 + 0.5 * d.quality) * (1 - (last - d.confirmedIndex) / (RECENT + 1)) * (d.status === "developing" ? 0.5 : 1);
  const best = pool.sort((a, b) => value(b) - value(a))[0];
  const pair = `${best.first.ts}>${best.second.ts}`;
  let v = value(best);
  const shared = counted.has(pair);
  if (shared) v *= 0.5;
  counted.add(pair);
  const sign = best.direction === "bullish" ? 1 : -1;
  const ind = best.indicator === "rsi" ? "RSI" : best.indicator === "macd" ? "MACD" : "MACD histogram";
  ev.push({
    text: `${best.status === "developing" ? "Developing " : ""}${DIVERGENCE_LABEL[best.type].toLowerCase()} on ${ind}: price ${pct(best.priceChangePct)} between ${best.first.ts.slice(0, 10)} and ${best.second.ts.slice(0, 10)}, ${ind} ${best.indicatorChange > 0 ? "+" : ""}${best.indicator === "rsi" ? best.indicatorChange.toFixed(1) : best.indicatorChange.toPrecision(3)}${shared ? " (same swing as the RSI divergence, counted at half weight)" : ""}.`,
    lean: sign > 0 ? "bullish" : "bearish", component: comp, weight: v,
  });
  return sign * v;
}

function rsiComponent(m: MomentumResult, counted: Set<string>): Component {
  const ev: Evidence[] = [];
  const st = m.state;
  if (st.rsi == null) return { key: "rsi", label: COMPONENT_LABEL.rsi, weight: WEIGHTS.rsi, score: 0, contribution: 0, evidence: [{ text: "Not enough history for RSI(14).", lean: "neutral", component: "rsi", weight: 0 }], available: false };
  const base: Record<string, [number, string]> = {
    positive: [0.25, "RSI is in positive territory (50–70)."], negative: [-0.25, "RSI is in negative territory (30–50)."],
    recovering_from_oversold: [0.45, "RSI is recovering from oversold."], falling_from_overbought: [-0.45, "RSI is falling from overbought."],
    oversold: [-0.15, "RSI is oversold: strong recent selling, a state rather than a buy signal."],
    overbought: [0.15, "RSI is overbought: strong recent buying, a state rather than a sell signal."],
  };
  const [b, text] = base[st.rsiState] ?? [0, ""];
  let s = b;
  if (text) ev.push({ text: `${text} RSI(14) = ${st.rsi.toFixed(1)}.`, lean: b > 0 ? "bullish" : b < 0 ? "bearish" : "neutral", component: "rsi", weight: Math.abs(b) });
  const mid = [...m.crossovers].reverse().find((c) => c.kind === "rsi_50_up" || c.kind === "rsi_50_down");
  if (mid && m.bars - 1 - mid.index <= 5) {
    const sign = mid.kind === "rsi_50_up" ? 1 : -1;
    s += 0.15 * sign;
    ev.push({ text: `RSI crossed ${sign > 0 ? "above" : "below"} 50 on ${mid.ts.slice(0, 10)}.`, lean: sign > 0 ? "bullish" : "bearish", component: "rsi", weight: 0.15 });
  }
  s += divergenceTerm(m, ["rsi"], counted, "rsi", ev);
  const score = clamp(s);
  return { key: "rsi", label: COMPONENT_LABEL.rsi, weight: WEIGHTS.rsi, score, contribution: score * WEIGHTS.rsi * 100, evidence: ev, available: true };
}

function macdComponent(m: MomentumResult, counted: Set<string>): Component {
  const ev: Evidence[] = [];
  const st = m.state;
  if (st.macd == null || st.signal == null) return { key: "macd", label: COMPONENT_LABEL.macd, weight: WEIGHTS.macd, score: 0, contribution: 0, evidence: [{ text: "Not enough history for MACD(12,26,9).", lean: "neutral", component: "macd", weight: 0 }], available: false };
  let s = 0;
  const z = st.macdAboveZero ? 0.2 : -0.2;
  s += z;
  ev.push({ text: `MACD is ${st.macdAboveZero ? "above" : "below"} zero (${st.macd.toPrecision(3)}): the 12-period EMA is ${st.macdAboveZero ? "above" : "below"} the 26-period EMA.`, lean: z > 0 ? "bullish" : "bearish", component: "macd", weight: 0.2 });
  if (st.lastMacdCross && st.lastMacdCross.barsAgo <= 10) {
    const sign = st.lastMacdCross.direction === "bullish" ? 1 : -1;
    const w = 0.35 * (1 - st.lastMacdCross.barsAgo / 11);
    s += sign * w;
    ev.push({ text: `${sign > 0 ? "Bullish" : "Bearish"} signal-line crossover ${st.lastMacdCross.barsAgo === 0 ? "on the latest bar" : `${st.lastMacdCross.barsAgo} bar${st.lastMacdCross.barsAgo === 1 ? "" : "s"} ago`} (${st.lastMacdCross.ts.slice(0, 10)}).`, lean: sign > 0 ? "bullish" : "bearish", component: "macd", weight: w });
  } else {
    const sign = st.macdAboveSignal ? 1 : -1;
    s += 0.1 * sign;
    ev.push({ text: `MACD is ${st.macdAboveSignal ? "above" : "below"} its signal line.`, lean: sign > 0 ? "bullish" : "bearish", component: "macd", weight: 0.1 });
  }
  const hist: Record<string, [number, string]> = {
    expanding_positive: [0.2, "Histogram positive and expanding: bullish momentum strengthening."],
    contracting_positive: [-0.1, "Histogram positive but contracting: bullish momentum weakening."],
    expanding_negative: [-0.2, "Histogram negative and expanding: bearish momentum strengthening."],
    contracting_negative: [0.1, "Histogram negative but contracting: bearish momentum weakening (early, not a reversal)."],
  };
  const h = hist[st.histState];
  if (h) { s += h[0]; ev.push({ text: h[1], lean: h[0] > 0 ? "bullish" : "bearish", component: "macd", weight: Math.abs(h[0]) }); }
  const line = divergenceTerm(m, ["macd"], counted, "macd", ev);
  s += line || 0.5 * divergenceTerm(m, ["hist"], counted, "macd", ev);
  const score = clamp(s);
  return { key: "macd", label: COMPONENT_LABEL.macd, weight: WEIGHTS.macd, score, contribution: score * WEIGHTS.macd * 100, evidence: ev, available: true };
}

function priceComponent(pa: PriceAction, last: number): Component {
  const ev: Evidence[] = [];
  let s = 0;
  if (pa.structure === "higher_highs_lows") { s += 0.35; ev.push({ text: "Higher highs and higher lows.", lean: "bullish", component: "price", weight: 0.35 }); }
  else if (pa.structure === "lower_highs_lows") { s -= 0.35; ev.push({ text: "Lower highs and lower lows.", lean: "bearish", component: "price", weight: 0.35 }); }
  else if (pa.structure === "mixed") ev.push({ text: "Swing structure is mixed (no clear sequence of highs and lows).", lean: "neutral", component: "price", weight: 0 });
  const [f, sl] = pa.maPeriods;
  if (pa.maTrend === "up") { s += 0.3; ev.push({ text: `Price above a rising ${f}-bar average, which is above the ${sl}-bar average.`, lean: "bullish", component: "price", weight: 0.3 }); }
  else if (pa.maTrend === "down") { s -= 0.3; ev.push({ text: `Price below a falling ${f}-bar average, which is below the ${sl}-bar average.`, lean: "bearish", component: "price", weight: 0.3 }); }
  else if (pa.maTrend === "mixed") ev.push({ text: `Moving averages (${f}/${sl}) are mixed.`, lean: "neutral", component: "price", weight: 0 });
  if (pa.breakOfStructure && pa.breakOfStructure.barsAgo <= 20) {
    const b = pa.breakOfStructure, sign = b.direction === "bullish" ? 1 : -1, w = 0.3 * (1 - b.barsAgo / 21);
    s += sign * w;
    ev.push({ text: `Break of structure: closed ${sign > 0 ? "above the swing high" : "below the swing low"} at ${px(b.level)} on ${b.ts.slice(0, 10)}.`, lean: sign > 0 ? "bullish" : "bearish", component: "price", weight: w });
  }
  if (pa.volume) {
    const { ratio, upShare } = pa.volume;
    if (ratio > 1.1 && Math.abs(upShare - 0.5) > 0.08) {
      const sign = upShare > 0.5 ? 1 : -1;
      s += 0.1 * sign;
      ev.push({ text: `Volume is ${pct(ratio - 1)} above its prior average, mostly on ${sign > 0 ? "up" : "down"} bars (${pct(upShare)} up-volume).`, lean: sign > 0 ? "bullish" : "bearish", component: "price", weight: 0.1 });
    }
  }
  const score = clamp(s);
  return { key: "price", label: COMPONENT_LABEL.price, weight: WEIGHTS.price, score, contribution: score * WEIGHTS.price * 100, evidence: ev, available: pa.structure !== "insufficient" || pa.maTrend !== "insufficient" || last < 0 };
}

// ---------------------------------------------------------------------------------------- scenarios

export interface Condition { label: string; met: boolean; detail: string }
export interface Level { price: number; basis: string }
export type ScenarioId = "wave3_setup" | "wave5_exhaustion" | "abc_completion";
export interface Scenario {
  id: ScenarioId;
  title: string;
  direction: "bullish" | "bearish";
  /** watch: the structure fits but momentum or price hasn't confirmed; active: ≥ 2 supporting conditions; confirmed: the confirmation level has been crossed. */
  status: "watch" | "active" | "confirmed";
  countId: string;
  conditions: Condition[];
  fibZone: { low: number; high: number; basis: string } | null;
  confirmation: Level | null;
  invalidation: Level | null;
  targets: Level[];
  interpretation: string;
}

interface Ctx { bars: MBar[]; m: MomentumResult; idx: Map<string, number>; close: number; atr: number }

const ixOf = (ctx: Ctx, ts: string) => ctx.idx.get(ts) ?? -1;
/** Extreme price since bar `from` (inclusive). */
function extremeSince(ctx: Ctx, from: number, kind: "high" | "low") {
  let best = { price: kind === "high" ? -Infinity : Infinity, index: -1 };
  for (let i = Math.max(0, from); i < ctx.bars.length; i++) {
    const v = kind === "high" ? ctx.bars[i].high : ctx.bars[i].low;
    if (kind === "high" ? v > best.price : v < best.price) best = { price: v, index: i };
  }
  return best;
}
/** Latest confirmed swing pivot of a type between two bar indexes (exclusive of `from`). */
function swingBetween(ctx: Ctx, type: "high" | "low", from: number, to = Infinity) {
  return [...ctx.m.pivots].reverse().find((p) => p.type === type && p.index > from && p.index <= to && p.confirmedIndex < ctx.bars.length) ?? null;
}
function findDiv(ctx: Ctx, direction: "bullish" | "bearish", kind: "regular" | "hidden" | "any", ind: "rsi" | "macd", firstFrom: number, secondFrom: number) {
  return [...ctx.m.divergences, ...ctx.m.developing].find((d) => d.direction === direction && d.indicator === ind
    && (kind === "any" || d.type.startsWith(kind)) && d.first.index >= firstFrom && d.second.index >= secondFrom) ?? null;
}
/**
 * Targets are levels price hasn't reached yet in the scenario's direction, and never the confirmation
 * level itself. If none of the structural targets qualify, the count's own Fibonacci targets for the
 * next move (fib.ts) are used.
 */
function aheadOf(targets: Level[], c: CompactCandidate, ctx: Ctx, bullish: boolean, confirm: number | null): Level[] {
  const ahead = (p: number) => (bullish ? p > ctx.close : p < ctx.close) && (confirm == null || Math.abs(p - confirm) > ctx.atr * 0.1);
  const out = targets.filter((t) => ahead(t.price));
  if (out.length) return out;
  return (c.tg ?? []).filter(([p]) => ahead(p)).map(([price, basis]) => ({ price, basis }));
}

function status(conds: Condition[], confirmed: boolean): Scenario["status"] {
  if (confirmed) return "confirmed";
  return conds.slice(1).filter((c) => c.met).length >= 2 ? "active" : "watch";
}

function wave3Setup(c: CompactCandidate, ctx: Ctx): Scenario | null {
  if (!(c.pt === "impulse" || c.pt === "leading_diagonal") || c.c || c.nx.l !== "3") return null;
  const up = c.d === "u", dir = up ? 1 : -1;
  const [p0, p1, p2] = c.p.map((x) => x[1]);
  const i1 = ixOf(ctx, c.p[1][0]), i2 = ixOf(ctx, c.p[2][0]);
  const L1 = Math.abs(p1 - p0), r2 = Math.abs(p2 - p1) / L1;
  // still early: not yet past the wave 3 = 161.8% target
  const t1618 = p2 + dir * 1.618 * L1;
  if (up ? ctx.close >= t1618 : ctx.close <= t1618) return null;
  const st = ctx.m.state;
  const div = findDiv(ctx, up ? "bullish" : "bearish", "any", "rsi", i1, i2 - 3);
  const resist = swingBetween(ctx, up ? "high" : "low", i2) ?? swingBetween(ctx, up ? "high" : "low", i1, i2);
  const confirmLevel = resist ? resist.price : p1;
  const crossSince = ctx.m.crossovers.find((x) => x.index >= i2 && x.kind === (up ? "macd_signal_up" : "macd_signal_down"));
  const conds: Condition[] = [
    { label: `Wave 1 ${up ? "advance" : "decline"} complete; wave 2 ended`, met: true, detail: `Wave 1 ${px(p0)} → ${px(p1)}, wave 2 to ${px(p2)}.` },
    { label: "Wave 2 retraced into the 50%–61.8% zone", met: r2 >= 0.48 && r2 <= 0.65, detail: `Wave 2 retraced ${pct(r2)} of wave 1.` },
    { label: up ? "RSI recovering or bullish divergence" : "RSI weakening or bearish divergence", met: !!div || (up ? ["recovering_from_oversold", "positive"] : ["falling_from_overbought", "negative"]).includes(st.rsiState), detail: div ? `${DIVERGENCE_LABEL[div.type]} into the wave 2 ${up ? "low" : "high"}.` : `RSI ${st.rsi?.toFixed(1) ?? "n/a"}.` },
    { label: up ? "MACD histogram less negative or rising" : "MACD histogram less positive or falling", met: up ? ["contracting_negative", "expanding_positive"].includes(st.histState) : ["contracting_positive", "expanding_negative"].includes(st.histState), detail: st.histState.replace(/_/g, " ") + "." },
    { label: `${up ? "Bullish" : "Bearish"} MACD crossover since wave 2`, met: !!crossSince, detail: crossSince ? `On ${crossSince.ts.slice(0, 10)}.` : "Not yet." },
    { label: `Price ${up ? "above" : "below"} the corrective ${up ? "high" : "low"} at ${px(confirmLevel)}`, met: up ? ctx.close > confirmLevel : ctx.close < confirmLevel, detail: `Close ${px(ctx.close)}.` },
  ];
  const confirmed = conds[5].met;
  return {
    id: "wave3_setup", title: `Potential ${up ? "bullish" : "bearish"} wave 3`, direction: up ? "bullish" : "bearish",
    status: status(conds, confirmed), countId: c.id, conditions: conds,
    fibZone: { low: Math.min(p1 - dir * 0.5 * L1, p1 - dir * 0.618 * L1), high: Math.max(p1 - dir * 0.5 * L1, p1 - dir * 0.618 * L1), basis: "50%–61.8% retracement of wave 1" },
    confirmation: { price: confirmLevel, basis: `A close ${up ? "above" : "below"} the corrective ${up ? "high" : "low"}${resist ? ` (${resist.ts.slice(0, 10)})` : " (end of wave 1)"}` },
    invalidation: { price: p0, basis: "Start of wave 1: wave 2 can never retrace beyond it (rule)" },
    targets: aheadOf([1, 1.618, 2.618].map((r) => ({ price: p2 + dir * r * L1, basis: `Wave 3 = ${pct(r)} of wave 1` })), c, ctx, up, null),
    interpretation: `Price ${conds[1].met ? "has pulled back into" : "pulled back"} ${pct(r2)} of wave 1${conds[1].met ? ", consistent with a wave 2 correction" : ""}. ${conds[2].met || conds[3].met ? `Momentum is ${up ? "improving" : "weakening"}, suggesting ${up ? "selling" : "buying"} pressure may be fading. ` : `Momentum has not yet turned ${up ? "up" : "down"}. `}A close ${up ? "above" : "below"} ${px(confirmLevel)} would add support for a developing wave 3 ${up ? "advance" : "decline"}; ${up ? "below" : "above"} ${px(p0)} the count is invalid.`,
  };
}

function wave5Exhaustion(c: CompactCandidate, ctx: Ctx): Scenario | null {
  if (!(c.pt === "impulse" || c.pt === "ending_diagonal")) return null;
  const inFive = !c.c && c.nx.l === "5", done = c.c;
  if (!inFive && !done) return null;
  const up = c.d === "u", dir = up ? 1 : -1;
  const P = c.p.map((x) => x[1]);
  const i2 = ixOf(ctx, c.p[2][0]), i3 = ixOf(ctx, c.p[3][0]), i4 = ixOf(ctx, c.p[4][0]);
  if (done && ctx.bars.length - 1 - ixOf(ctx, c.p[5][0]) > 30) return null; // an old top is history, not a setup
  const ext = extremeSince(ctx, i4, up ? "high" : "low");
  const targets = [P[4] + dir * 0.618 * Math.abs(P[3] - P[0]), P[4] + dir * Math.abs(P[1] - P[0])];
  const nearest = Math.min(...targets.map((t) => dir * (t - ext.price)));
  const reached = nearest <= ctx.atr;
  const beyond3 = up ? ext.price > P[3] : ext.price < P[3];
  const rsiDiv = findDiv(ctx, up ? "bearish" : "bullish", "regular", "rsi", i2, i4);
  const macdDiv = findDiv(ctx, up ? "bearish" : "bullish", "regular", "macd", i2, i4);
  const st = ctx.m.state;
  const histWeak = up ? ["contracting_positive", "expanding_negative"].includes(st.histState) : ["contracting_negative", "expanding_positive"].includes(st.histState);
  const cross = ctx.m.crossovers.find((x) => x.index >= ext.index && x.kind === (up ? "macd_signal_down" : "macd_signal_up"));
  const support = swingBetween(ctx, up ? "low" : "high", i4, ext.index) ;
  const confirmLevel = support && (up ? support.price > P[4] : support.price < P[4]) ? support.price : P[4];
  const conds: Condition[] = [
    { label: `Fifth wave ${done ? "complete" : "in progress"}`, met: true, detail: `Wave 4 ended at ${px(P[4])}; wave 5 ${up ? "high" : "low"} so far ${px(ext.price)}.` },
    { label: "Price reached a wave 5 Fibonacci target", met: reached, detail: `Targets ${targets.map(px).join(" and ")} (61.8% of waves 1–3; wave 5 = wave 1).` },
    { label: `Price made a new ${up ? "high" : "low"} beyond wave 3`, met: beyond3, detail: `Wave 3 ended at ${px(P[3])}.` },
    { label: `RSI ${up ? "lower high" : "higher low"} (regular divergence)`, met: !!rsiDiv, detail: rsiDiv ? `${rsiDiv.first.ts.slice(0, 10)} → ${rsiDiv.second.ts.slice(0, 10)}${rsiDiv.status === "developing" ? ", developing" : ""}.` : "Not present." },
    { label: `MACD ${up ? "lower high" : "higher low"} (regular divergence)`, met: !!macdDiv, detail: macdDiv ? `${macdDiv.first.ts.slice(0, 10)} → ${macdDiv.second.ts.slice(0, 10)}${macdDiv.status === "developing" ? ", developing" : ""}.` : "Not present." },
    { label: "MACD histogram weakening", met: histWeak, detail: st.histState.replace(/_/g, " ") + "." },
    { label: `${up ? "Bearish" : "Bullish"} MACD crossover after the extreme`, met: !!cross, detail: cross ? `On ${cross.ts.slice(0, 10)}.` : "Not yet." },
  ];
  const confirmed = up ? ctx.close < confirmLevel : ctx.close > confirmLevel;
  const whole = Math.abs(ext.price - P[0]);
  return {
    id: "wave5_exhaustion", title: `Wave 5 exhaustion (${up ? "bearish" : "bullish"} reversal risk)`, direction: up ? "bearish" : "bullish",
    status: status(conds, confirmed), countId: c.id, conditions: conds,
    fibZone: { low: Math.min(...targets), high: Math.max(...targets), basis: "Wave 5 targets: 61.8% of waves 1–3 and wave 5 = wave 1" },
    confirmation: { price: confirmLevel, basis: `A close ${up ? "below" : "above"} ${support && confirmLevel !== P[4] ? "the latest swing inside wave 5" : "the end of wave 4"}` },
    invalidation: { price: ext.price, basis: `A new ${up ? "high" : "low"} beyond ${px(ext.price)} with RSI and MACD confirming it would undo the exhaustion reading` },
    targets: aheadOf([{ price: P[4], basis: "End of wave 4: corrections tend to end near it" },
      ...[0.382, 0.5, 0.618].map((r) => ({ price: ext.price - dir * r * whole, basis: `${pct(r)} retracement of waves 1–5` }))], c, ctx, !up, null),
    interpretation: `${reached ? "Price has reached a projected fifth-wave target" : "The fifth wave is under way"}${rsiDiv || macdDiv ? ` while ${[rsiDiv && "RSI", macdDiv && "MACD"].filter(Boolean).join(" and ")} failed to confirm the latest ${up ? "high" : "low"}` : ""}. ${rsiDiv || macdDiv ? `That divergence may indicate weakening ${up ? "bullish" : "bearish"} momentum and a higher chance of a corrective phase. ` : "Momentum has not yet diverged. "}A close ${up ? "below" : "above"} ${px(confirmLevel)} would strengthen the ${up ? "bearish" : "bullish"} interpretation; divergence alone does not confirm the end of wave 5.`,
  };
}

function abcCompletion(c: CompactCandidate, ctx: Ctx): Scenario | null {
  if (!(c.pt === "zigzag" || c.pt === "flat")) return null;
  const inC = !c.c && c.nx.l === "C", done = c.c;
  if (!inC && !done) return null;
  const down = c.d === "d"; // a declining correction completes bullish
  const sgn = down ? -1 : 1;
  const P = c.p.map((x) => x[1]);
  const i0 = ixOf(ctx, c.p[0][0]), i2 = ixOf(ctx, c.p[2][0]);
  if (done && ctx.bars.length - 1 - ixOf(ctx, c.p[3][0]) > 30) return null;
  const A = Math.abs(P[1] - P[0]);
  const ext = extremeSince(ctx, i2, down ? "low" : "high");
  const proj = [1, 1.618].map((r) => P[2] + sgn * r * A);
  const reached = sgn * (ext.price - proj[0]) >= -ctx.atr;
  const div = findDiv(ctx, down ? "bullish" : "bearish", "regular", "rsi", i0, i2);
  const mdiv = findDiv(ctx, down ? "bullish" : "bearish", "regular", "macd", i0, i2);
  const st = ctx.m.state;
  const contracting = down ? ["contracting_negative", "expanding_positive"].includes(st.histState) : ["contracting_positive", "expanding_negative"].includes(st.histState);
  const resist = swingBetween(ctx, down ? "high" : "low", i2);
  const confirmLevel = resist && ext.index > resist.index ? resist.price : P[2];
  const conds: Condition[] = [
    { label: `${c.pt === "zigzag" ? "Zigzag" : "Flat"} correction, wave C ${done ? "complete" : "in progress"}`, met: true, detail: `A ${px(P[0])} → ${px(P[1])}, B ${px(P[2])}, C ${down ? "low" : "high"} so far ${px(ext.price)}.` },
    { label: "Wave C reached its projection (C = A or more)", met: reached, detail: `C = A at ${px(proj[0])}; C = 161.8% of A at ${px(proj[1])}.` },
    { label: `Regular ${down ? "bullish" : "bearish"} RSI divergence`, met: !!div, detail: div ? `${div.first.ts.slice(0, 10)} → ${div.second.ts.slice(0, 10)}${div.status === "developing" ? ", developing" : ""}.` : "Not present." },
    { label: `MACD ${down ? "downside" : "upside"} momentum contracting`, met: contracting || !!mdiv, detail: mdiv ? `MACD divergence ${mdiv.first.ts.slice(0, 10)} → ${mdiv.second.ts.slice(0, 10)}.` : st.histState.replace(/_/g, " ") + "." },
    { label: `Price recovering ${down ? "above" : "below"} corrective ${down ? "resistance" : "support"} at ${px(confirmLevel)}`, met: down ? ctx.close > confirmLevel : ctx.close < confirmLevel, detail: `Close ${px(ctx.close)}.` },
  ];
  const confirmed = conds[4].met && ext.index < ctx.bars.length - 1;
  return {
    id: "abc_completion", title: `Potential ${down ? "bullish" : "bearish"} ABC completion`, direction: down ? "bullish" : "bearish",
    status: status(conds, confirmed), countId: c.id, conditions: conds,
    fibZone: { low: Math.min(...proj), high: Math.max(...proj), basis: "Wave C = 100%–161.8% of wave A" },
    confirmation: { price: confirmLevel, basis: `A close ${down ? "above" : "below"} the last corrective swing ${down ? "high" : "low"}${resist && confirmLevel !== P[2] ? "" : " (end of wave B)"}` },
    invalidation: done ? { price: ext.price, basis: `A ${down ? "close below" : "close above"} the wave C ${down ? "low" : "high"}: the correction would still be extending` }
      : { price: proj[1], basis: "Beyond C = 161.8% of A the correction is unusually extended, or larger than labeled" },
    targets: aheadOf([{ price: P[2], basis: "End of wave B" }, { price: P[0], basis: "Start of wave A" }], c, ctx, down, confirmLevel),
    interpretation: `Wave C ${reached ? "has reached its projection zone" : "is still short of its usual C = A projection"}${div ? ` with a regular ${down ? "bullish" : "bearish"} RSI divergence between the A and C ${down ? "lows" : "highs"}` : ""}. ${conds[4].met ? `Price has already moved back ${down ? "above" : "below"} ${px(confirmLevel)}, consistent with a completed correction.` : `A close ${down ? "above" : "below"} ${px(confirmLevel)} would support a completed correction.`}`,
  };
}

// --------------------------------------------------------------------------------------------- main

export interface ConfluenceResult {
  version: string;
  degree: string;
  asOf: string | null;
  close: number | null;
  index: number;
  classification: ConfluenceClass;
  components: Component[];
  supporting: Evidence[];
  conflicting: Evidence[];
  redundancy: string | null;
  priceAction: PriceAction;
  scenarios: Scenario[];
  /** Preferred and alternate count ids at this degree, for linking the UI to the wave chart. */
  preferredId: string | null;
  alternateId: string | null;
  keyLevels: { price: number; label: string; kind: "confirmation" | "invalidation" | "support" | "resistance" | "target" }[];
}

export function analyzeConfluence(inp: Inputs): ConfluenceResult {
  const { bars, momentum: m } = inp;
  const n = bars.length;
  const pa = priceAction(bars, m);
  const counted = new Set<string>();
  const rsi = rsiComponent(m, counted), macdC = macdComponent(m, counted);
  // RSI and MACD are both functions of price: when they agree, the weaker one counts at 75%
  let redundancy: string | null = null;
  if (rsi.available && macdC.available && Math.sign(rsi.score) === Math.sign(macdC.score) && rsi.score !== 0) {
    const weaker = Math.abs(rsi.score) <= Math.abs(macdC.score) ? rsi : macdC;
    weaker.score *= 0.75; weaker.contribution = weaker.score * weaker.weight * 100;
    redundancy = `RSI and MACD agree. Both are derived from price, so the weaker (${weaker.key.toUpperCase()}) counts at 75% to avoid double-counting.`;
  }
  const components = [waveComponent(inp.counts), fibComponent(inp, pa), rsi, macdC, priceComponent(pa, n - 1)];
  const index = Math.round(components.reduce((a, c) => a + c.contribution, 0));
  const lean = index > 0 ? "bullish" : index < 0 ? "bearish" : "neutral";
  const all = components.flatMap((c) => c.evidence).filter((e) => e.lean !== "neutral");
  const supporting = all.filter((e) => e.lean === lean).sort((a, b) => b.weight - a.weight);
  const conflicting = all.filter((e) => e.lean !== lean).sort((a, b) => b.weight - a.weight);

  const idx = new Map(bars.map((b, i) => [b.ts, i]));
  const close = bars.at(-1)?.close ?? NaN;
  const ctx: Ctx = { bars, m, idx, close, atr: pa.atr ?? close * 0.02 };
  const { pref, alt } = preferredPair(inp.counts);
  const scenarios: Scenario[] = [];
  for (const c of [pref, alt]) {
    if (!c) continue;
    for (const f of [wave3Setup, wave5Exhaustion, abcCompletion]) {
      const s = f(c, ctx);
      if (s && !scenarios.some((x) => x.id === s.id && x.direction === s.direction)) scenarios.push(s);
    }
  }

  const keyLevels: ConfluenceResult["keyLevels"] = [];
  for (const s of scenarios) {
    if (s.confirmation) keyLevels.push({ price: s.confirmation.price, label: `${s.title}: confirmation`, kind: "confirmation" });
    if (s.invalidation) keyLevels.push({ price: s.invalidation.price, label: `${s.title}: invalidation`, kind: "invalidation" });
  }
  if (pref?.nx.h != null) keyLevels.push({ price: pref.nx.h, label: `Preferred count invalidation (${pref.nx.hr ?? "rule"})`, kind: "invalidation" });
  if (pa.support) keyLevels.push({ price: pa.support.price, label: `Swing support (${pa.support.ts.slice(0, 10)})`, kind: "support" });
  if (pa.resistance) keyLevels.push({ price: pa.resistance.price, label: `Swing resistance (${pa.resistance.ts.slice(0, 10)})`, kind: "resistance" });
  const seen = new Set<string>();
  const levels = keyLevels.filter((l) => { const k = `${l.kind}:${l.price.toPrecision(6)}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.price - a.price);

  return {
    version: CONFLUENCE_VERSION, degree: inp.degree, asOf: bars.at(-1)?.ts ?? null, close: n ? close : null,
    index, classification: classOf(index), components, supporting, conflicting, redundancy,
    priceAction: pa, scenarios, preferredId: pref?.id ?? null, alternateId: alt?.id ?? null, keyLevels: levels,
  };
}
