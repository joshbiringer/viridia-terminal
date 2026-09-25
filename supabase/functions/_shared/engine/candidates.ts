/**
 * Viridia engine, Phase 5: candidate wave counts.
 *
 * Turns a pivot series (pivots.ts) into every Elliott Wave labeling of the recent swings that passes
 * the hard rules (rules.ts). Nothing here ranks, scores or prefers one count over another: that is
 * Phase 7. The output is the set of counts the rules still allow, each with its evidence and the
 * price that would invalidate it.
 *
 * Method
 *   1. Take the last `lookback` confirmed pivots of one degree. The latest pivot is the anchor: every
 *      candidate's last labeled point is that pivot, so each count describes the market as it stands.
 *   2. Walk backwards from the anchor choosing earlier pivots of alternating type. A leg may skip
 *      smaller swings, but only if its endpoints are the extremes of everything inside it, so the
 *      skipped swings are internal sub-waves of the leg rather than ignored price.
 *   3. For each chain of 3 to 6 points, and each pattern the length allows, run the Phase 4
 *      validator with the bars and the most extreme price since the anchor. A chain survives only
 *      with zero rule failures. Chains that break a rule are counted by rule id, for transparency.
 *   4. Counts are de-duplicated and sorted by a neutral, documented order (see `byCoverage`): more
 *      waves explained first, then longer spans. This is ordering for display, not a confidence.
 *
 * Deterministic: the same pivots, bars and options always give the same candidates in the same order.
 * No look-ahead: the input is whatever bars the caller passes; the engine never reads beyond them.
 */
import { PIVOT_ALGORITHM_VERSION, type Degree, type Pivot, type PivotBar, type PendingSwing, type Timeframe } from "./pivots.ts";
import {
  RULES_VERSION, validate, type Direction, type Invalidation, type Pattern, type Validation, type WavePoint,
} from "./rules.ts";

export const CANDIDATES_VERSION = "candidates-1.0.0";

/** Version stamped on every cached analysis row: a change to any engine stage recomputes the cache. */
export const ANALYSIS_VERSION = `${PIVOT_ALGORITHM_VERSION}+${RULES_VERSION}+${CANDIDATES_VERSION}`;

/** Patterns generated in Phase 5. Combinations need lower-degree component counts (Phase 9). */
export const CANDIDATE_PATTERNS = ["impulse", "leading_diagonal", "ending_diagonal", "zigzag", "flat", "triangle"] as const;
export type CandidatePattern = (typeof CANDIDATE_PATTERNS)[number];

const MAX_POINTS: Record<CandidatePattern, number> = {
  impulse: 6, leading_diagonal: 6, ending_diagonal: 6, zigzag: 4, flat: 4, triangle: 6,
};

export const PATTERN_LABEL: Record<CandidatePattern, string> = {
  impulse: "Impulse", leading_diagonal: "Leading diagonal", ending_diagonal: "Ending diagonal",
  zigzag: "Zigzag", flat: "Flat", triangle: "Triangle",
};

export interface CandidateOptions {
  /** How many of the most recent confirmed pivots to consider. */
  lookback?: number;
  /** Fewest points in a candidate (3 = two completed waves). */
  minPoints?: number;
  /** Upper bound on candidates returned per degree, after sorting. */
  maxCandidates?: number;
  patterns?: readonly CandidatePattern[];
}

export const DEFAULT_CANDIDATE_OPTIONS: Required<CandidateOptions> = {
  lookback: 14, minPoints: 3, maxCandidates: 24, patterns: CANDIDATE_PATTERNS,
};

export interface NextWave {
  label: string;
  direction: Direction;
  /** Rule-based level the wave in progress must not cross (nearest to the anchor), if any. */
  mustHold: Invalidation | null;
}

export interface Candidate {
  /** Stable id: pattern, degree and the timestamps of its points. */
  id: string;
  version: string;
  timeframe: Timeframe;
  degree: Degree;
  pattern: CandidatePattern;
  subtype: string | null;
  direction: Direction;
  /** Labels of the completed waves, in order ("1","2","3" or "A","B"). */
  labels: string[];
  points: WavePoint[];
  complete: boolean;
  /**
   * What comes next. For an incomplete count this is the wave in progress. For a complete count it is
   * the move that follows the finished pattern (label "next"), in the opposite direction.
   */
  next: NextWave;
  /** Nearest rule-based invalidation level, or null if the rules define none in this state. */
  invalidationPrice: number | null;
  invalidations: Invalidation[];
  /** Guideline, Fibonacci and heuristic checks that were evaluated (pending ones excluded). */
  evidence: { passed: number; evaluated: number; fibMatches: number; fibTotal: number };
  spanBars: number;
  /** Full Phase 4 validation, for the evidence panel. */
  validation: Validation;
}

export interface CandidateSet {
  version: string;
  timeframe: Timeframe;
  degree: Degree;
  anchor: { ts: string; price: number; type: "high" | "low" } | null;
  /** Chains examined and how many were eliminated by a rule, for transparency. */
  examined: number;
  eliminated: number;
  /** Rule ids that eliminated chains, with counts (most frequent first). */
  eliminatedBy: { ruleId: string; count: number }[];
  candidates: Candidate[];
  truncated: boolean;
}

// ------------------------------------------------------------------------------------------ helpers

const toPoint = (p: Pivot): WavePoint => ({ index: p.index, ts: p.ts, price: p.price });

/**
 * Leg i→j (pivot positions in `piv`) is admissible when its endpoints are the extremes of every pivot
 * between them: nothing inside rises above the high end or falls below the low end.
 */
function admissible(piv: Pivot[], i: number, j: number): boolean {
  const a = piv[i], b = piv[j];
  if (a.type === b.type) return false;
  const hi = a.type === "high" ? a.price : b.price, lo = a.type === "low" ? a.price : b.price;
  for (let k = i + 1; k < j; k++) {
    const x = piv[k];
    if (x.type === "high" ? x.price > hi : x.price < lo) return false;
  }
  return true;
}

/** Rule failures other than the live check (which depends on price after the anchor, not the chain). */
const structuralFails = (v: Validation) => v.ruleViolations.filter((c) => c.id !== "structure.live");

/** Neutral display order: more waves explained, then longer span, then the more recent start, then id. */
export function byCoverage(a: Candidate, b: Candidate): number {
  return b.points.length - a.points.length || b.spanBars - a.spanBars
    || b.points[0].index - a.points[0].index || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function nextWave(v: Validation): NextWave {
  const k = v.points.length - 1; // completed waves
  const legDir: Direction = k % 2 === 0 ? v.direction : (v.direction === "up" ? "down" : "up");
  const ruleInv = v.invalidations.filter((x) => x.kind === "rule");
  const ref = v.points[k].price;
  const mustHold = ruleInv.length ? ruleInv.reduce((m, x) => (Math.abs(x.price - ref) < Math.abs(m.price - ref) ? x : m)) : null;
  if (v.complete) return { label: "next", direction: v.direction === "up" ? "down" : "up", mustHold: null };
  return { label: v.inProgress ?? "?", direction: legDir, mustHold };
}

function summarize(v: Validation): Candidate["evidence"] {
  const evaluated = v.guidelineMatches.filter((c) => c.status === "pass" || c.status === "fail");
  return {
    passed: evaluated.filter((c) => c.status === "pass").length, evaluated: evaluated.length,
    fibMatches: v.fibRelationships.filter((f) => f.matches).length, fibTotal: v.fibRelationships.length,
  };
}

// ------------------------------------------------------------------------------------------ generator

export interface GenerateInput {
  timeframe: Timeframe;
  degree: Degree;
  pivots: Pivot[];
  /** Bars the pivots index into. Enables the segment-extreme rule on real price, not just pivots. */
  bars?: PivotBar[];
  /** The swing in progress after the anchor, if any. Its extreme feeds the live invalidation check. */
  pending?: PendingSwing | null;
}

export function generateCandidates(input: GenerateInput, options: CandidateOptions = {}): CandidateSet {
  const o = { ...DEFAULT_CANDIDATE_OPTIONS, ...options };
  const { timeframe, degree, bars } = input;
  const piv = input.pivots.slice(-o.lookback);
  const empty: CandidateSet = {
    version: CANDIDATES_VERSION, timeframe, degree, anchor: null, examined: 0, eliminated: 0, eliminatedBy: [], candidates: [], truncated: false,
  };
  if (piv.length < o.minPoints) return piv.length ? { ...empty, anchor: anchorOf(piv.at(-1)!) } : empty;

  // Price after the anchor, for the live check: the most extreme price of the swing in progress
  // (that is the price most likely to have crossed a level), else the last close.
  let last: { index: number; price: number } | undefined;
  if (input.pending) last = { index: input.pending.index, price: input.pending.price };
  else if (bars?.length) last = { index: bars.length - 1, price: bars[bars.length - 1].close };

  const ruleBars = bars?.map((b) => ({ high: b.high, low: b.low }));
  const found = new Map<string, Candidate>();
  const elim = new Map<string, number>();
  let examined = 0, eliminated = 0;
  const maxLen = Math.max(...o.patterns.map((p) => MAX_POINTS[p]));
  const A = piv.length - 1;

  // Chains are built backwards from the anchor: chain[0] is the anchor, chain.at(-1) the earliest point.
  const extend = (chain: number[]) => {
    const n = chain.length;
    if (n >= o.minPoints) {
      const pts = chain.slice().reverse().map((k) => toPoint(piv[k]));
      for (const pattern of o.patterns) {
        if (n > MAX_POINTS[pattern]) continue;
        examined++;
        const v = validate(pattern as Pattern, pts, { bars: ruleBars, last });
        const fails = structuralFails(v);
        if (fails.length || !v.valid) {
          eliminated++;
          const id = (fails[0] ?? v.ruleViolations[0]).id;
          elim.set(id, (elim.get(id) ?? 0) + 1);
          continue;
        }
        const c = toCandidate(v, pattern, timeframe, degree);
        if (!found.has(c.id)) found.set(c.id, c);
      }
    }
    if (n >= maxLen) return;
    const head = chain[n - 1];
    for (let i = head - 1; i >= 0; i--) {
      if (piv[i].type === piv[head].type) continue;
      if (!admissible(piv, i, head)) continue;
      extend([...chain, i]);
    }
  };
  extend([A]);

  const all = [...found.values()].sort(byCoverage);
  return {
    version: CANDIDATES_VERSION, timeframe, degree, anchor: anchorOf(piv[A]),
    examined, eliminated,
    eliminatedBy: [...elim.entries()].map(([ruleId, count]) => ({ ruleId, count })).sort((a, b) => b.count - a.count || (a.ruleId < b.ruleId ? -1 : 1)),
    candidates: all.slice(0, o.maxCandidates), truncated: all.length > o.maxCandidates,
  };
}

const anchorOf = (p: Pivot) => ({ ts: p.ts, price: p.price, type: p.type });

function toCandidate(v: Validation, pattern: CandidatePattern, timeframe: Timeframe, degree: Degree): Candidate {
  return {
    id: `${pattern}:${degree}:${v.points.map((p) => p.ts.slice(0, 10)).join(">")}`,
    version: CANDIDATES_VERSION, timeframe, degree, pattern, subtype: v.subtype, direction: v.direction,
    labels: v.labels, points: v.points, complete: v.complete, next: nextWave(v),
    invalidationPrice: v.invalidationPrice, invalidations: v.invalidations, evidence: summarize(v),
    spanBars: v.points[v.points.length - 1].index - v.points[0].index, validation: v,
  };
}

// ------------------------------------------------------------------------------------------ storage

/** Compact candidate stored in analysis_results.candidate_counts_json (the full validation is recomputable). */
export interface CompactCandidate {
  id: string; pt: CandidatePattern; st: string | null; d: "u" | "d"; c: boolean;
  p: [string, number][]; nx: { l: string; d: "u" | "d"; h: number | null; hs: "above" | "below" | null; hr: string | null };
  inv: number | null; ev: [number, number, number, number];
}

export function compactCandidate(c: Candidate): CompactCandidate {
  return {
    id: c.id, pt: c.pattern, st: c.subtype, d: c.direction === "up" ? "u" : "d", c: c.complete,
    p: c.points.map((x) => [x.ts, x.price]),
    nx: {
      l: c.next.label, d: c.next.direction === "up" ? "u" : "d",
      h: c.next.mustHold?.price ?? null, hs: c.next.mustHold?.side ?? null, hr: c.next.mustHold?.reason ?? null,
    },
    inv: c.invalidationPrice,
    ev: [c.evidence.passed, c.evidence.evaluated, c.evidence.fibMatches, c.evidence.fibTotal],
  };
}

export interface CompactCandidateSet {
  v: string; a: CandidateSet["anchor"]; x: number; e: number;
  eb: CandidateSet["eliminatedBy"]; t: boolean; c: CompactCandidate[];
}

export function compactSet(s: CandidateSet, keep = 12): CompactCandidateSet {
  return {
    v: s.version, a: s.anchor, x: s.examined, e: s.eliminated, eb: s.eliminatedBy.slice(0, 6),
    t: s.truncated || s.candidates.length > keep, c: s.candidates.slice(0, keep).map(compactCandidate),
  };
}

export { RULES_VERSION };
