/**
 * Viridia engine, Phase 6: Fibonacci levels and confluence zones.
 *
 * Every level is arithmetic on confirmed pivots and on the labeled points of rule-valid candidate
 * counts (Phase 5). Each level records the exact relationship that produced it ("wave 4 at 38.2% of
 * wave 3"), the source that describes the tendency, and the count it belongs to. Confluence zones are
 * price bands where independent relationships cluster. A zone's strength is a weighted count of those
 * relationships, not a probability.
 *
 * Sources: "Essentials" = Prechter, Learn the Essentials of the Elliott Wave Principle.
 *          "Basics"     = EWI, Basics of the Elliott Wave Principle.
 *          "EWF"        = Elliott Wave Forecast, Elliott Wave Theory.
 *          "EWP"        = Frost & Prechter, Elliott Wave Principle.
 *
 * No look-ahead: levels use only the pivots, candidates and bars passed in.
 */
import type { Degree, Pivot, PivotBar, PendingSwing } from "./pivots.ts";
import type { Candidate, CandidateSet } from "./candidates.ts";
import type { Direction } from "./rules.ts";

export const FIB_VERSION = "fib-1.0.0";

export type LevelKind =
  | "retracement"     // a correction measured against the wave it corrects
  | "projection"      // a wave measured against an earlier wave, projected from the current wave's start
  | "channel"         // Elliott's parallel trend channel, evaluated at the latest bar
  | "prior_fourth"    // the prior fourth wave of one lesser degree (Essentials: depth of corrective waves)
  | "swing";          // plain retracement of the latest confirmed swing, independent of any count

export type LevelSource = "Essentials" | "Basics" | "EWF" | "EWP" | "Viridia";

export interface FibLevel {
  price: number;
  kind: LevelKind;
  /** Fibonacci ratio, when the level is a ratio (null for channels and prior-fourth levels). */
  ratio: number | null;
  /** Plain-language relationship, e.g. "Wave 5 = wave 1 (100%)". */
  label: string;
  source: LevelSource;
  degree: Degree;
  /** Candidate count that produced it (null for swing levels). */
  candidateId: string | null;
  /** Label of the wave the level targets ("4", "C", "next"), or null for swing levels. */
  wave: string | null;
  /** True for the ratios the sources name as most common for this wave. */
  primary: boolean;
  /**
   * Identity of the measured relationship: kind, ratio and the timestamps of the points measured.
   * Two candidates that share a leg produce the same key, so a relationship is counted once.
   */
  key: string;
  weight: number;
  /** Whether the swing in progress has already traded through the level. */
  reached: boolean;
}

export interface ConfluenceZone {
  low: number;
  high: number;
  mid: number;
  /** Weighted count of distinct relationships in the zone (primary ratios and higher degrees weigh more). */
  strength: number;
  /** Distinct relationships in the zone. */
  count: number;
  degrees: Degree[];
  side: "above" | "below";
  /** Distance from the latest close to the zone midpoint, as a fraction of price. */
  distancePct: number;
  levels: Pick<FibLevel, "price" | "label" | "degree" | "kind" | "source" | "primary">[];
}

export interface FibAnalysis {
  version: string;
  close: number;
  /** Half-width used to cluster levels: max(0.25 × ATR(14), 0.4% of price). */
  tolerance: number;
  levels: Record<Degree, FibLevel[]>;
  zones: ConfluenceZone[];
  /** Targets per candidate id, for the count's detail view. */
  targets: Record<string, FibLevel[]>;
}

// ------------------------------------------------------------------------------------------ helpers

const DEGREE_WEIGHT: Record<Degree, number> = { minor: 1, intermediate: 2, primary: 3 };
const LOWER: Record<Degree, Degree | null> = { minor: null, intermediate: "minor", primary: "intermediate" };
const pctLabel = (r: number) => `${+(r * 100).toFixed(1)}%`;
const d10 = (ts: string) => ts.slice(0, 10);

interface Pt { index: number; ts: string; price: number }

class Collector {
  out: FibLevel[] = [];
  constructor(
    private degree: Degree, private candidate: Candidate | null, private dirOfMove: Direction,
    private anchor: Pt, private extreme: number | null,
  ) {}
  add(price: number, kind: LevelKind, ratio: number | null, label: string, source: LevelSource,
      wave: string | null, primary: boolean, measured: Pt[]) {
    if (!(price > 0) || !Number.isFinite(price)) return;
    // a target must lie in the direction the move is travelling from the anchor
    if (this.dirOfMove === "up" ? price <= this.anchor.price : price >= this.anchor.price) return;
    const reached = this.extreme != null && (this.dirOfMove === "up" ? this.extreme >= price : this.extreme <= price);
    const key = `${kind}:${ratio ?? "-"}:${measured.map((m) => d10(m.ts)).join(">")}`;
    const weight = DEGREE_WEIGHT[this.degree] * (primary ? 1 : 0.6) * (kind === "swing" ? 0.5 : 1);
    this.out.push({
      price, kind, ratio, label, source, degree: this.degree, candidateId: this.candidate?.id ?? null,
      wave, primary, key, weight, reached,
    });
  }
}

/** Parallel-channel value at bar `at`: line through a and c, shifted to pass through b. Log or arithmetic. */
function channelAt(a: Pt, c: Pt, b: Pt, at: number, log: boolean): number {
  const f = log ? Math.log : (x: number) => x;
  const slope = (f(c.price) - f(a.price)) / (c.index - a.index || 1);
  const v = f(b.price) + slope * (at - b.index);
  return log ? Math.exp(v) : v;
}

// ------------------------------------------------------------------------------------------ per-count targets

export interface TargetContext {
  /** Bars the pivots index into (for the latest bar index). */
  lastIndex: number;
  /** Most extreme price of the swing in progress, if any. */
  pending: PendingSwing | null;
  /** Confirmed pivots one degree lower, for prior-fourth levels. */
  lowerPivots: Pivot[] | null;
}

/**
 * Fibonacci targets for what comes next in one candidate count: the wave in progress, or the move
 * after a complete pattern. Levels a hard rule forbids (beyond the count's invalidation) are dropped.
 */
export function candidateTargets(c: Candidate, ctx: TargetContext): FibLevel[] {
  const p = c.points, k = p.length - 1, up = c.direction === "up";
  const move = c.next.direction;
  const s = move === "up" ? 1 : -1;
  const anchor = p[k];
  const col = new Collector(c.degree, c, move, anchor, ctx.pending ? ctx.pending.price : null);
  const L = (i: number) => Math.abs(p[i].price - p[i - 1].price);
  const from = anchor.price;
  const W = c.next.label;
  const motive = c.pattern === "impulse" || c.pattern === "leading_diagonal" || c.pattern === "ending_diagonal";

  if (!c.complete && motive) {
    if (k === 2) { // wave 3 in progress
      const ratios = c.pattern === "impulse" ? [[1, false], [1.618, true], [2.618, false]] : [[0.618, false], [1, true], [1.618, false]];
      for (const [r, prim] of ratios as [number, boolean][])
        col.add(from + s * r * L(1), "projection", r, `Wave 3 = ${pctLabel(r)} of wave 1`, c.pattern === "impulse" ? "EWF" : "EWP", W, prim, [p[0], p[1], p[2]]);
    }
    if (k === 3) { // wave 4 in progress
      for (const [r, prim] of [[0.236, false], [0.382, true], [0.5, false]] as [number, boolean][])
        col.add(from + s * r * L(3), "retracement", r, `Wave 4 retraces ${pctLabel(r)} of wave 3`, "EWF", W, prim, [p[2], p[3]]);
      priorFourth(col, ctx.lowerPivots, p[2], p[3], up, W, "Wave 4");
      for (const log of [false, true])
        col.add(channelAt(p[1], p[3], p[2], ctx.lastIndex, log), "channel", null,
          `Wave 4 channel (line 1–3 through 2${log ? ", log scale" : ""})`, "EWP", W, false, [p[1], p[2], p[3]]);
    }
    if (k === 4) { // wave 5 in progress
      const w13 = Math.abs(p[3].price - p[0].price);
      for (const [r, prim] of [[0.618, false], [1, true], [1.618, false]] as [number, boolean][])
        col.add(from + s * r * L(1), "projection", r, `Wave 5 = ${pctLabel(r)} of wave 1`, "Essentials", W, prim, [p[0], p[1], p[4]]);
      for (const [r, prim] of [[0.618, true], [1.618, false]] as [number, boolean][])
        col.add(from + s * r * w13, "projection", r, `Wave 5 = ${pctLabel(r)} of waves 1–3`, "Essentials", W, prim, [p[0], p[3], p[4]]);
      for (const log of [false, true])
        col.add(channelAt(p[2], p[4], p[3], ctx.lastIndex, log), "channel", null,
          `Wave 5 channel (line 2–4 through 3${log ? ", log scale" : ""})`, "Essentials", W, true, [p[2], p[3], p[4]]);
    }
  }

  if (c.complete && motive) { // the correction after a finished five-wave move
    const whole = Math.abs(p[5].price - p[0].price);
    for (const [r, prim] of [[0.382, true], [0.5, false], [0.618, true]] as [number, boolean][])
      col.add(from + s * r * whole, "retracement", r, `Correction retraces ${pctLabel(r)} of waves 1–5`, "Basics", "next", prim, [p[0], p[5]]);
    col.add(p[4].price, "prior_fourth", null, "Correction ends near the end of wave 4", "Essentials", "next", true, [p[4]]);
  }

  if (!c.complete && (c.pattern === "zigzag" || c.pattern === "flat") && k === 2) { // wave C in progress
    const ratios: [number, boolean][] = c.pattern === "zigzag"
      ? [[0.618, false], [1, true], [1.236, false], [1.618, true]]
      : [[1, true], [1.236, false], [1.618, c.subtype === "expanded"]];
    for (const [r, prim] of ratios)
      col.add(from + s * r * L(1), "projection", r, `Wave C = ${pctLabel(r)} of wave A`, r === 1.236 ? "EWF" : "Essentials", W, prim, [p[0], p[1], p[2]]);
  }

  if (c.complete && (c.pattern === "zigzag" || c.pattern === "flat")) { // trend resumes after the correction
    const whole = Math.abs(p[3].price - p[0].price);
    for (const [r, prim] of [[0.618, true], [1, false]] as [number, boolean][])
      col.add(from + s * r * whole, "retracement", r, `Move after the correction retraces ${pctLabel(r)} of A–C`, "Viridia", "next", prim, [p[0], p[3]]);
  }

  if (c.pattern === "triangle") {
    if (!c.complete && k >= 2) { // next leg (C, D or E)
      for (const [r, prim] of [[0.618, true], [0.786, false]] as [number, boolean][])
        col.add(from + s * r * L(k), "projection", r, `Wave ${W} = ${pctLabel(r)} of wave ${c.labels[k - 1]}`, "EWF", W, prim, [p[k - 1], p[k]]);
      if (k >= 3)
        col.add(from + s * 0.618 * L(k - 1), "projection", 0.618, `Wave ${W} = 61.8% of wave ${c.labels[k - 2]}`, "Essentials", W, true, [p[k - 2], p[k - 1], p[k]]);
    }
    if (c.complete) { // thrust out of the triangle: roughly the widest part (wave A)
      col.add(from + s * L(1), "projection", 1, "Thrust after the triangle ≈ width of wave A", "EWP", "next", true, [p[0], p[1], p[5]]);
    }
  }

  // drop levels a hard rule forbids for this count
  const rules = c.invalidations.filter((v) => v.kind === "rule");
  return col.out.filter((l) => !rules.some((v) => (v.side === "above" ? l.price > v.price : l.price < v.price)));
}

/**
 * The prior fourth wave of one lesser degree: inside the wave being corrected (from `start` to `end`),
 * the last lower-degree counter-trend pivot before `end`. Corrections tend to end near it.
 */
function priorFourth(col: Collector, lower: Pivot[] | null, start: Pt, end: Pt, trendUp: boolean, W: string, name: string) {
  if (!lower) return;
  const want = trendUp ? "low" : "high";
  const inside = lower.filter((x) => x.index > start.index && x.index < end.index && x.type === want);
  const last = inside.at(-1);
  if (!last) return;
  col.add(last.price, "prior_fourth", null, `${name} near the prior fourth wave of lesser degree (${d10(last.ts)})`, "Essentials", W, true, [last]);
}

// ------------------------------------------------------------------------------------------ swing levels

/** Retracements of the latest confirmed swing (the one the swing in progress is correcting). */
export function swingLevels(degree: Degree, pivots: Pivot[], pending: PendingSwing | null): FibLevel[] {
  if (pivots.length < 2) return [];
  const a = pivots[pivots.length - 2], b = pivots[pivots.length - 1];
  const move: Direction = b.type === "high" ? "down" : "up";
  const col = new Collector(degree, null, move, b, pending ? pending.price : null);
  const len = Math.abs(b.price - a.price), s = move === "up" ? 1 : -1;
  const name = `${b.type === "high" ? "rise" : "decline"} ${d10(a.ts)} → ${d10(b.ts)}`;
  for (const [r, prim] of [[0.382, true], [0.5, false], [0.618, true], [0.786, false]] as [number, boolean][])
    col.add(b.price + s * r * len, "swing", r, `${pctLabel(r)} retracement of the ${name}`, "Basics", null, prim, [a, b]);
  return col.out;
}

// ------------------------------------------------------------------------------------------ confluence

export interface AnalyzeFibInput {
  bars: PivotBar[];
  pivots: Record<Degree, Pivot[]>;
  pending: Record<Degree, PendingSwing | null>;
  candidates: Record<Degree, CandidateSet>;
  /** How many candidates per degree contribute targets (in the candidate set's order). */
  perDegree?: number;
}

export function analyzeFib(input: AnalyzeFibInput): FibAnalysis {
  const { bars } = input;
  const close = bars.at(-1)?.close ?? 0;
  const tolerance = Math.max(0.25 * atr14(bars), 0.004 * close);
  const degrees: Degree[] = ["minor", "intermediate", "primary"];
  const levels = {} as Record<Degree, FibLevel[]>;
  const targets: Record<string, FibLevel[]> = {};

  for (const d of degrees) {
    const lower = LOWER[d] ? input.pivots[LOWER[d]!] : null;
    const ctx: TargetContext = { lastIndex: bars.length - 1, pending: input.pending[d], lowerPivots: lower };
    const all: FibLevel[] = [...swingLevels(d, input.pivots[d], input.pending[d])];
    for (const c of input.candidates[d].candidates.slice(0, input.perDegree ?? 12)) {
      const t = candidateTargets(c, ctx);
      targets[c.id] = t;
      all.push(...t);
    }
    // one entry per distinct relationship
    const seen = new Map<string, FibLevel>();
    for (const l of all) if (!seen.has(l.key)) seen.set(l.key, l);
    levels[d] = [...seen.values()].sort((a, b) => a.price - b.price);
  }

  return { version: FIB_VERSION, close, tolerance, levels, targets, zones: confluence(levels, close, tolerance) };
}

/**
 * Groups levels (from every degree) that lie within 2 × tolerance of the lowest level in the group.
 * A zone needs at least two distinct relationships measured from different legs. Only levels not yet
 * traded through, and within 35% of the close, are considered.
 */
export function confluence(levels: Record<Degree, FibLevel[]>, close: number, tolerance: number, max = 6): ConfluenceZone[] {
  const pool = Object.values(levels).flat()
    .filter((l) => !l.reached && Math.abs(l.price / close - 1) <= 0.35)
    .sort((a, b) => a.price - b.price || (a.key < b.key ? -1 : 1));
  const zones: ConfluenceZone[] = [];
  let i = 0;
  while (i < pool.length) {
    let j = i;
    while (j + 1 < pool.length && pool[j + 1].price - pool[i].price <= 2 * tolerance) j++;
    const group = pool.slice(i, j + 1);
    const keys = new Map<string, FibLevel>();
    for (const l of group) if (!keys.has(l.key)) keys.set(l.key, l);
    const distinct = [...keys.values()];
    const legs = new Set(distinct.map((l) => l.key.split(":").slice(2).join(":")));
    if (distinct.length >= 2 && legs.size >= 2) {
      const low = Math.min(...distinct.map((l) => l.price)), high = Math.max(...distinct.map((l) => l.price));
      const mid = (low + high) / 2;
      zones.push({
        low, high, mid,
        strength: Math.round(distinct.reduce((a, l) => a + l.weight, 0) * 10) / 10,
        count: distinct.length,
        degrees: [...new Set(distinct.map((l) => l.degree))],
        side: mid >= close ? "above" : "below",
        distancePct: mid / close - 1,
        levels: distinct.map(({ price, label, degree, kind, source, primary }) => ({ price, label, degree, kind, source, primary })),
      });
      i = j + 1;
    } else i++;
  }
  return zones.sort((a, b) => b.strength - a.strength || Math.abs(a.distancePct) - Math.abs(b.distancePct)).slice(0, max);
}

function atr14(bars: PivotBar[]): number {
  let atr = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const tr = i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close));
    atr = i < 14 ? (atr * i + tr) / (i + 1) : (atr * 13 + tr) / 14;
  }
  return atr;
}

// ------------------------------------------------------------------------------------------ storage

export interface CompactLevel { p: number; k: LevelKind; r: number | null; l: string; s: LevelSource; w: string | null; pr: boolean; rc: boolean }
export const compactLevel = (l: FibLevel): CompactLevel => ({
  p: Math.round(l.price * 1e4) / 1e4, k: l.kind, r: l.ratio, l: l.label, s: l.source, w: l.wave, pr: l.primary, rc: l.reached,
});
