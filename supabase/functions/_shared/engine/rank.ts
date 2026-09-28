/**
 * Viridia engine, Phase 7: ranking rule-valid counts (Pattern Confidence).
 *
 * Method (Essentials): "the analyst will generally regard as preferred the interpretation that
 * satisfies the largest number of guidelines and will accord top alternate status to the
 * interpretation satisfying the next largest number of guidelines."
 *
 * So a count's evidence is every non-rule check the validator evaluated (guidelines, Fibonacci
 * tendencies and Viridia heuristics from rules.ts) plus wave-personality checks measured here from
 * price, time and volume (see viridia-wave-knowledge.md, section 3). Each check that could be
 * evaluated counts once; checks that are still pending or need data we do not have are left out.
 *
 *   Pattern Confidence = round(100 × (passed + 2) / (evaluated + 4))
 *
 * The +2/+4 is a neutral prior: a count with no evidence scores 50, and one or two lucky passes
 * cannot outrank a count with a long record. Every check has equal weight in this version; weights
 * change only when a backtest justifies it. It is an evidence score, not a probability.
 *
 * Deterministic, and uses only the bars up to the anchor's analysis (no look-ahead).
 */
import type { Candidate } from "./candidates.ts";
import type { PivotBar } from "./pivots.ts";
import { RULEBOOK } from "./rules.ts";

export const RANK_VERSION = "rank-1.0.0";

/** Wave-personality checks measured by this module. */
export const PERSONALITY = {
  "personality.start_extreme": {
    text: "The count starts at the price extreme of the prior swing (a new trend begins where the old one ended)",
    source: "Viridia",
  },
  "personality.w3_velocity": {
    text: "Wave 3 moves faster (price per bar) than waves 1 and 5",
    source: "Article",
  },
  "personality.w3_volume": {
    text: "Wave 3 has the heaviest average volume of the actionary waves",
    source: "Article",
  },
  "personality.w5_volume": {
    text: "Wave 5 comes on lighter average volume than wave 3",
    source: "Article",
  },
  "personality.w4_time": {
    text: "Waves 2 and 4 alternate in time too: the shallower correction takes at least as long",
    source: "Essentials",
  },
} as const;
export type PersonalityId = keyof typeof PERSONALITY;

/**
 * Fixed, append-only list of evidence ids. Compact storage records a factor by its position here, so
 * reordering it requires a version bump.
 */
export const FACTOR_IDS: string[] = [
  ...RULEBOOK.filter((r) => r.category !== "rule").map((r) => r.id),
  ...Object.keys(PERSONALITY),
];

export interface Factor { id: string; pass: boolean }

export interface Rank {
  version: string;
  score: number;
  passed: number;
  evaluated: number;
  factors: Factor[];
}

export type ConfidenceBand = "high" | "medium" | "low";
export const band = (score: number): ConfidenceBand => (score >= 70 ? "high" : score >= 58 ? "medium" : "low");
/** Preferred and alternate within this many points: treat the count as a close call. */
export const CLOSE_CALL = 5;

export const scoreOf = (passed: number, evaluated: number) => Math.round((100 * (passed + 2)) / (evaluated + 4));

// ------------------------------------------------------------------------------------------ measures

function avgVolume(bars: PivotBar[], from: number, to: number): number | null {
  let sum = 0, n = 0;
  for (let i = Math.max(0, from + 1); i <= Math.min(to, bars.length - 1); i++) {
    const v = bars[i].volume;
    if (v == null || !Number.isFinite(v) || v <= 0) return null; // any gap: not measurable
    sum += v; n++;
  }
  return n ? sum / n : null;
}

function personality(c: Candidate, bars: PivotBar[] | undefined): Factor[] {
  const out: Factor[] = [];
  const p = c.points;
  const up = c.direction === "up";

  // Start at an extreme: nothing in the look-back window (the count's own span, at least 10 bars)
  // went beyond the starting point.
  if (bars?.length) {
    const s = p[0].index, span = Math.max(10, p[p.length - 1].index - s);
    const from = Math.max(0, s - span);
    if (s - from >= 5) {
      let ok = true;
      for (let i = from; i < s && ok; i++) ok = up ? bars[i].low >= p[0].price : bars[i].high <= p[0].price;
      out.push({ id: "personality.start_extreme", pass: ok });
    }
  }

  if (c.pattern !== "impulse") return out;
  const w = (k: number) => ({ len: Math.abs(p[k].price - p[k - 1].price), bars: Math.max(1, p[k].index - p[k - 1].index) });

  if (p.length >= 4) {
    const w1 = w(1), w3 = w(3), w5 = p.length >= 6 ? w(5) : null;
    const v = (x: { len: number; bars: number }) => x.len / x.bars;
    out.push({ id: "personality.w3_velocity", pass: v(w3) >= v(w1) && (!w5 || v(w3) >= v(w5)) });

    if (bars?.length) {
      const vol = (k: number) => avgVolume(bars, p[k - 1].index, p[k].index);
      const v1 = vol(1), v3 = vol(3), v5 = p.length >= 6 ? vol(5) : null;
      if (v1 != null && v3 != null && (p.length < 6 || v5 != null)) {
        out.push({ id: "personality.w3_volume", pass: v3 > v1 && (v5 == null || v3 >= v5) });
      }
      if (v3 != null && v5 != null) out.push({ id: "personality.w5_volume", pass: v5 < v3 });
    }
  }

  if (p.length >= 5) {
    const w2 = w(2), w4 = w(4);
    const r2 = w2.len / w(1).len, r4 = w4.len / w(3).len;
    // the shallower correction (by retracement) should take at least as long as the deeper one
    out.push({ id: "personality.w4_time", pass: r2 >= r4 ? w4.bars >= w2.bars : w2.bars >= w4.bars });
  }
  return out;
}

// ------------------------------------------------------------------------------------------ ranking

export function rankCandidate(c: Candidate, bars?: PivotBar[]): Rank {
  const factors: Factor[] = c.validation.checks
    .filter((x) => x.category !== "rule" && (x.status === "pass" || x.status === "fail"))
    .map((x) => ({ id: x.id, pass: x.status === "pass" }));
  factors.push(...personality(c, bars));
  const passed = factors.filter((f) => f.pass).length;
  return { version: RANK_VERSION, score: scoreOf(passed, factors.length), passed, evaluated: factors.length, factors };
}

/**
 * Attach a rank to every candidate and order them: highest Pattern Confidence first, then more
 * evidence evaluated, then the caller's neutral order (the input order), which keeps it deterministic.
 */
export function rankCandidates<T extends Candidate>(cands: T[], bars?: PivotBar[]): (T & { rank: Rank })[] {
  return cands
    .map((c, i) => ({ c: { ...c, rank: rankCandidate(c, bars) }, i }))
    .sort((a, b) => b.c.rank.score - a.c.rank.score || b.c.rank.evaluated - a.c.rank.evaluated || a.i - b.i)
    .map((x) => x.c);
}

/** Compact factor encoding: +(position+1) for a pass, −(position+1) for a fail. Unknown ids are dropped. */
export const encodeFactors = (f: Factor[]) =>
  f.map((x) => { const k = FACTOR_IDS.indexOf(x.id); return k < 0 ? 0 : x.pass ? k + 1 : -(k + 1); }).filter((n) => n !== 0);
export const decodeFactors = (codes: number[]): Factor[] =>
  codes.map((n) => ({ id: FACTOR_IDS[Math.abs(n) - 1], pass: n > 0 })).filter((f) => !!f.id);
