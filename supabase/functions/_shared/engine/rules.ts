/**
 * Viridia engine, Phase 4: Elliott Wave hard-rule validation.
 *
 * Pure, deterministic arithmetic on wave endpoints (normally pivots from pivots.ts). No model,
 * language or otherwise, can change a result here. Every check is one of four kinds:
 *
 *   rule       – always holds for the pattern. A failed rule eliminates the count.
 *   guideline  – usually holds. Recorded as evidence for ranking (Phase 7); never eliminates.
 *   fibonacci  – a Fibonacci tendency. Evidence only.
 *   heuristic  – a Viridia-specific judgment (e.g. what counts as "about equal"). Evidence only.
 *
 * Sources: "Essentials" = R. Prechter, Learn the Essentials of the Elliott Wave Principle (EWI).
 *          "EWF" = Elliott Wave Forecast, Elliott Wave Theory (guidelines and Fibonacci ratios).
 *          "EWP" = Frost & Prechter, Elliott Wave Principle (rules not spelled out in Essentials).
 *
 * Counts may be incomplete: pass the confirmed endpoints so far (at least two). Rules that need a
 * later endpoint report "pending", and the result lists the invalidation levels that apply to the
 * wave in progress.
 */

export const RULES_VERSION = "rules-1.0.0";

export type Direction = "up" | "down";
export type Category = "rule" | "guideline" | "fibonacci" | "heuristic";
export type Status = "pass" | "fail" | "pending" | "unverified";
export type Source = "Essentials" | "EWF" | "EWP" | "Viridia";
export type Pattern = "impulse" | "leading_diagonal" | "ending_diagonal" | "zigzag" | "flat" | "triangle" | "combination";

export interface WavePoint { index: number; ts: string; price: number }
export interface RuleBar { high: number; low: number }

export interface Check {
  id: string;
  category: Category;
  text: string;
  source: Source;
  status: Status;
  detail: string;
  measured?: Record<string, number>;
}

export interface WaveMeasure {
  label: string;
  start: WavePoint;
  end: WavePoint;
  change: number;
  changePct: number;
  bars: number;
  days: number;
}

export interface FibRelationship {
  id: string;
  text: string;
  ratio: number;
  nearest: number;
  deviation: number;
  matches: boolean;
}

export interface Invalidation {
  price: number;
  /** Price moving beyond this level in this direction breaks the count. */
  side: "above" | "below";
  /** "rule": a hard rule would be broken. "count": this labeling would be wrong (e.g. the wave has not ended). */
  kind: "rule" | "count";
  ruleId?: string;
  reason: string;
}

export interface Validation {
  version: string;
  pattern: Pattern;
  subtype: string | null;
  direction: Direction;
  labels: string[];
  points: WavePoint[];
  complete: boolean;
  /** Label of the wave in progress when the count is incomplete. */
  inProgress: string | null;
  valid: boolean;
  checks: Check[];
  ruleViolations: Check[];
  guidelineMatches: Check[];
  fibRelationships: FibRelationship[];
  waves: WaveMeasure[];
  invalidations: Invalidation[];
  /** Nearest rule-based invalidation level, if the rules define one for the current state. */
  invalidationPrice: number | null;
  /** Filled by the ranking engine (Phase 7). Null until then: no score is shown before it means something. */
  confidenceScore: null;
}

export interface ValidateOptions {
  /** Bars the points index into; enables the segment-extreme rule. */
  bars?: RuleBar[];
  /** Latest price after the last point; a crossed rule-based invalidation eliminates the count. */
  last?: { index: number; price: number };
}

// ------------------------------------------------------------------------------------------ rulebook

interface Def { category: Category; text: string; source: Source; appliesTo: Pattern[] }
const ALL: Pattern[] = ["impulse", "leading_diagonal", "ending_diagonal", "zigzag", "flat", "triangle", "combination"];
const MOTIVE: Pattern[] = ["impulse", "leading_diagonal", "ending_diagonal"];
const DIAG: Pattern[] = ["leading_diagonal", "ending_diagonal"];

const DEFS = {
  // structure
  "structure.alternating": { category: "rule", source: "Viridia", appliesTo: ALL, text: "Each wave moves opposite to the one before it, starting in the pattern's direction" },
  "structure.segment_extremes": { category: "rule", source: "Viridia", appliesTo: ALL, text: "Each wave starts and ends at the price extremes of its own span (no unlabeled higher high or lower low inside it)" },
  "structure.live": { category: "rule", source: "Viridia", appliesTo: ALL, text: "Price after the last labeled point has not crossed a rule-based invalidation level" },
  // motive (impulse and diagonal)
  "motive.w2_lt_100": { category: "rule", source: "Essentials", appliesTo: MOTIVE, text: "Wave 2 always retraces less than 100% of wave 1" },
  "motive.w3_beyond_w1": { category: "rule", source: "Essentials", appliesTo: MOTIVE, text: "Wave 3 always travels beyond the end of wave 1" },
  "motive.w3_not_shortest": { category: "rule", source: "Essentials", appliesTo: MOTIVE, text: "Wave 3 is never the shortest of waves 1, 3 and 5 (satisfied on either a price or a percentage basis)" },
  "motive.w4_lt_100": { category: "rule", source: "Essentials", appliesTo: MOTIVE, text: "Wave 4 always retraces less than 100% of wave 3" },
  "impulse.w4_no_overlap": { category: "rule", source: "Essentials", appliesTo: ["impulse"], text: "Wave 4 does not enter the price territory of wave 1" },
  // diagonal shape
  "diagonal.contracting": { category: "rule", source: "EWP", appliesTo: DIAG, text: "Contracting diagonal: wave 3 is shorter than wave 1, wave 5 shorter than wave 3, and wave 4 shorter than wave 2" },
  "diagonal.expanding": { category: "rule", source: "EWP", appliesTo: DIAG, text: "Expanding diagonal: wave 3 is longer than wave 1, wave 5 longer than wave 3, and wave 4 longer than wave 2" },
  "diagonal.w4_overlaps_w1": { category: "guideline", source: "Essentials", appliesTo: DIAG, text: "Wave 4 almost always ends in the price territory of wave 1" },
  "diagonal.w5_beyond_w3": { category: "guideline", source: "EWP", appliesTo: DIAG, text: "Wave 5 almost always ends at least slightly beyond the end of wave 3" },
  // impulse guidelines
  "impulse.extension": { category: "guideline", source: "Essentials", appliesTo: ["impulse"], text: "One actionary wave (1, 3 or 5) is extended, most often wave 3 in stocks" },
  "impulse.equality": { category: "guideline", source: "Essentials", appliesTo: ["impulse"], text: "When wave 3 is extended, waves 1 and 5 tend toward equality" },
  "impulse.alternation": { category: "guideline", source: "Essentials", appliesTo: ["impulse"], text: "Waves 2 and 4 alternate: one sharp and deep, the other shallow or sideways" },
  "impulse.no_truncation": { category: "guideline", source: "Essentials", appliesTo: ["impulse"], text: "Wave 5 exceeds the end of wave 3 (a failure is called a truncation)" },
  "impulse.w2_depth": { category: "fibonacci", source: "EWF", appliesTo: ["impulse"], text: "Wave 2 retraces 50% to 85.4% of wave 1" },
  "impulse.w3_extension": { category: "fibonacci", source: "EWF", appliesTo: ["impulse"], text: "Wave 3 measures 161.8% or more of wave 1" },
  "impulse.w4_depth": { category: "fibonacci", source: "EWF", appliesTo: ["impulse"], text: "Wave 4 retraces 14.6% to 38.2% of wave 3, and no more than 50%" },
  // zigzag
  "zigzag.b_lt_100": { category: "rule", source: "Essentials", appliesTo: ["zigzag"], text: "Wave B ends short of the start of wave A (a zigzag is a sharp correction)" },
  "zigzag.c_beyond_a": { category: "guideline", source: "Essentials", appliesTo: ["zigzag"], text: "Wave C travels beyond the end of wave A (a failure is a truncation)" },
  "zigzag.b_depth": { category: "fibonacci", source: "EWF", appliesTo: ["zigzag"], text: "Wave B retraces 38.2% to 85.4% of wave A" },
  "zigzag.c_vs_a": { category: "fibonacci", source: "EWF", appliesTo: ["zigzag"], text: "Wave C equals 61.8%, 100% or 123.6% of wave A" },
  "zigzag.not_flat": { category: "heuristic", source: "Viridia", appliesTo: ["zigzag"], text: "Wave B retraces under 90% of wave A (deeper B waves fit a flat better)" },
  // flat
  "flat.b_ge_90": { category: "rule", source: "EWP", appliesTo: ["flat"], text: "Wave B retraces at least 90% of wave A" },
  "flat.c_shape": { category: "guideline", source: "Essentials", appliesTo: ["flat"], text: "Wave C ends slightly beyond wave A (regular), substantially beyond (expanded), or short of it after an extended B (running)" },
  "flat.c_vs_ab": { category: "fibonacci", source: "EWF", appliesTo: ["flat"], text: "Wave C measures 61.8% to 161.8% of wave A, depending on the flat type" },
  // triangle
  "triangle.contracting": { category: "rule", source: "EWP", appliesTo: ["triangle"], text: "Contracting triangle: C ends short of A's end, D short of B's end, and E short of C's end" },
  "triangle.expanding": { category: "rule", source: "EWP", appliesTo: ["triangle"], text: "Expanding triangle: C ends beyond A's end, D beyond B's end, and E beyond C's end" },
  "triangle.leg_ratio": { category: "fibonacci", source: "EWF", appliesTo: ["triangle"], text: "In a contracting triangle each leg is roughly 61.8% to 85.4% of the one before" },
  // combination
  "combo.max_three": { category: "rule", source: "Essentials", appliesTo: ["combination"], text: "A combination joins at most three corrective patterns (W-X-Y or W-X-Y-X-Z)" },
  "combo.components_corrective": { category: "rule", source: "Essentials", appliesTo: ["combination"], text: "W, Y and Z are each corrective patterns (zigzag, flat or triangle)" },
  "combo.triangle_last": { category: "rule", source: "EWP", appliesTo: ["combination"], text: "A triangle can appear only as the last component" },
  "combo.dzz_x": { category: "rule", source: "Essentials", appliesTo: ["combination"], text: "Double zigzag: wave X ends short of the start of wave W (sharp correction)" },
  "combo.x_depth": { category: "fibonacci", source: "EWF", appliesTo: ["combination"], text: "Wave X retraces 50% to 85.4% of wave W" },
  "combo.y_vs_w": { category: "fibonacci", source: "EWF", appliesTo: ["combination"], text: "Wave Y equals 61.8%, 100% or 123.6% of wave W, and does not pass 161.8%" },
} satisfies Record<string, Def>;

export type RuleId = keyof typeof DEFS;
export const RULEBOOK: ({ id: RuleId } & Def)[] = (Object.entries(DEFS) as [RuleId, Def][]).map(([id, d]) => ({ id, ...d }));

// ------------------------------------------------------------------------------------------ helpers

const FIB = [0.236, 0.382, 0.5, 0.618, 0.786, 0.854, 1, 1.236, 1.382, 1.618, 2, 2.618, 3.236, 4.236];

const opp = (d: Direction): Direction => (d === "up" ? "down" : "up");
/** a lies beyond b in direction d (strictly). */
const beyond = (a: number, b: number, d: Direction) => (d === "up" ? a > b : a < b);
const len = (p: WavePoint[], i: number) => Math.abs(p[i].price - p[i - 1].price);
const lpct = (p: WavePoint[], i: number) => Math.abs(Math.log(p[i].price / p[i - 1].price));
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const pc = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmt = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(2) : Math.abs(x) >= 1 ? x.toFixed(2) : x.toPrecision(3));

function fib(id: string, text: string, ratio: number): FibRelationship {
  let nearest = FIB[0];
  for (const f of FIB) if (Math.abs(f - ratio) < Math.abs(nearest - ratio)) nearest = f;
  const deviation = ratio - nearest;
  return { id, text, ratio: r3(ratio), nearest, deviation: r3(deviation), matches: Math.abs(deviation) <= Math.max(0.015, 0.03 * nearest) };
}

class Builder {
  checks: Check[] = [];
  invalidations: Invalidation[] = [];
  fibs: FibRelationship[] = [];
  add(id: RuleId, status: Status, detail: string, measured?: Record<string, number>) {
    const d = DEFS[id] as Def;
    this.checks.push({ id, category: d.category, text: d.text, source: d.source, status, detail, ...(measured ? { measured } : {}) });
  }
  inv(price: number, side: "above" | "below", kind: "rule" | "count", reason: string, ruleId?: RuleId) {
    this.invalidations.push({ price, side, kind, reason, ...(ruleId ? { ruleId } : {}) });
  }
  /** Side on which crossing `price` breaks a rule, for a level that must not be exceeded in direction d. */
  static side(d: Direction): "above" | "below" { return d === "up" ? "above" : "below"; }
}

function measures(points: WavePoint[], labels: string[]): WaveMeasure[] {
  return points.slice(1).map((end, k) => {
    const start = points[k];
    const change = end.price - start.price;
    return {
      label: labels[k], start, end, change, changePct: change / start.price,
      bars: end.index - start.index,
      days: Math.round((Date.parse(end.ts) - Date.parse(start.ts)) / 86_400_000),
    };
  });
}

function structural(b: Builder, p: WavePoint[], dir: Direction, labels: string[], opts: ValidateOptions) {
  // alternation: odd-numbered legs (1st, 3rd, ...) move with the pattern, even ones against it
  let bad = -1;
  for (let i = 1; i < p.length; i++) {
    const want = i % 2 === 1 ? dir : opp(dir);
    if (!beyond(p[i].price, p[i - 1].price, want) || p[i].index <= p[i - 1].index) { bad = i; break; }
  }
  b.add("structure.alternating", bad < 0 ? "pass" : "fail",
    bad < 0 ? "Every leg reverses the one before it, in time order." : `Wave ${labels[bad - 1]} does not move ${i2dir(bad, dir)} from the previous point, or is out of time order.`);

  if (opts.bars) {
    const bars = opts.bars;
    let seg = -1;
    for (let i = 1; i < p.length && seg < 0; i++) {
      const up = (i % 2 === 1 ? dir : opp(dir)) === "up";
      const a = p[i - 1], e = p[i];
      if (a.index < 0 || e.index >= bars.length) { seg = i; break; }
      const eps = 1e-9 * Math.max(1, Math.abs(e.price));
      for (let j = a.index; j <= e.index; j++) {
        const x = bars[j];
        // the start bar's far side and the end bar's near side are exempt (outside bars can hold both extremes)
        const pastEnd = j > a.index && (up ? x.high > e.price + eps : x.low < e.price - eps);
        const pastStart = j < e.index && (up ? x.low < a.price - eps : x.high > a.price + eps);
        if (pastEnd || pastStart) { seg = i; break; }
      }
    }
    b.add("structure.segment_extremes", seg < 0 ? "pass" : "fail",
      seg < 0 ? "Each wave's endpoints are the extremes of its span." : `Price inside wave ${labels[seg - 1]} went beyond its labeled start or end.`);
  }
}
function i2dir(i: number, dir: Direction) { return (i % 2 === 1 ? dir : opp(dir)) === "up" ? "up" : "down"; }

function finish(
  b: Builder, pattern: Pattern, subtype: string | null, dir: Direction, labels: string[], p: WavePoint[],
  needed: number, opts: ValidateOptions,
): Validation {
  const complete = p.length >= needed;
  // live check: has price since the last point crossed a rule-based level?
  if (opts.last) {
    const rulesInv = b.invalidations.filter((v) => v.kind === "rule");
    const hit = rulesInv.find((v) => (v.side === "above" ? opts.last!.price > v.price : opts.last!.price < v.price));
    b.add("structure.live", hit ? "fail" : "pass",
      hit ? `Latest price ${fmt(opts.last.price)} is ${hit.side} ${fmt(hit.price)}: ${hit.reason}` : "No rule-based level has been crossed since the last labeled point.",
      { last: opts.last.price });
  }
  const ruleViolations = b.checks.filter((c) => c.category === "rule" && c.status === "fail");
  const ruleInv = b.invalidations.filter((v) => v.kind === "rule");
  const ref = p[p.length - 1].price;
  const nearest = ruleInv.length ? ruleInv.reduce((m, v) => (Math.abs(v.price - ref) < Math.abs(m.price - ref) ? v : m)) : null;
  return {
    version: RULES_VERSION, pattern, subtype, direction: dir, labels: labels.slice(0, p.length - 1), points: p,
    complete, inProgress: complete ? null : labels[p.length - 1] ?? null,
    valid: ruleViolations.length === 0,
    checks: b.checks, ruleViolations,
    guidelineMatches: b.checks.filter((c) => c.category !== "rule"),
    fibRelationships: b.fibs,
    waves: measures(p, labels), invalidations: b.invalidations,
    invalidationPrice: nearest?.price ?? null, confidenceScore: null,
  };
}

function need(p: WavePoint[], min: number, max: number, name: string) {
  if (p.length < min || p.length > max) throw new Error(`${name} needs ${min}–${max} points, got ${p.length}`);
}
const dirOf = (p: WavePoint[]): Direction => (p[1].price >= p[0].price ? "up" : "down");

// ------------------------------------------------------------------------------------------ impulse

const MOTIVE_LABELS = ["1", "2", "3", "4", "5"];

/** Points p0 (start of wave 1) … p5 (end of wave 5); at least p0 and p1. */
export function validateImpulse(p: WavePoint[], opts: ValidateOptions = {}): Validation {
  need(p, 2, 6, "An impulse");
  const dir = dirOf(p), b = new Builder(), L = MOTIVE_LABELS, up = dir === "up";
  const S = Builder.side(opp(dir)); // side against the trend (below for a bull impulse)
  structural(b, p, dir, L, opts);
  motiveCore(b, p, dir);

  if (p.length >= 5) {
    const ok = beyond(p[4].price, p[1].price, dir);
    b.add("impulse.w4_no_overlap", ok ? "pass" : "fail",
      ok ? `Wave 4 ended at ${fmt(p[4].price)}, ${up ? "above" : "below"} the wave 1 high of ${fmt(p[1].price)}.`
        : `Wave 4 reached ${fmt(p[4].price)}, inside wave 1 territory (wave 1 ended at ${fmt(p[1].price)}).`,
      { w4_end: p[4].price, w1_end: p[1].price });
  } else b.add("impulse.w4_no_overlap", "pending", "Needs the end of wave 4.");

  // invalidation for the wave in progress
  const k = p.length - 1; // confirmed waves
  if (k === 1) b.inv(p[0].price, S, "rule", "wave 2 cannot retrace beyond the start of wave 1", "motive.w2_lt_100");
  if (k === 2) {
    b.inv(p[0].price, S, "rule", "a move beyond the wave 1 origin breaks the impulse", "motive.w2_lt_100");
    b.inv(p[2].price, S, "count", "a move beyond the wave 2 extreme means wave 2 has not ended");
  }
  if (k === 3) b.inv(p[1].price, S, "rule", "wave 4 cannot enter wave 1 territory", "impulse.w4_no_overlap");
  if (k === 4) {
    b.inv(p[1].price, S, "rule", "wave 4 cannot enter wave 1 territory", "impulse.w4_no_overlap");
    b.inv(p[4].price, S, "count", "a move beyond the wave 4 extreme means wave 4 has not ended");
    capWave5(b, p, dir);
  }

  // guidelines and Fibonacci tendencies
  if (p.length >= 3) {
    const r2 = len(p, 2) / len(p, 1);
    b.fibs.push(fib("w2/w1", "Wave 2 retracement of wave 1", r2));
    b.add("impulse.w2_depth", r2 >= 0.5 && r2 <= 0.854 ? "pass" : "fail", `Wave 2 retraced ${pc(r2)} of wave 1.`, { ratio: r3(r2) });
  }
  if (p.length >= 4) {
    const r = len(p, 3) / len(p, 1);
    b.fibs.push(fib("w3/w1", "Wave 3 as a multiple of wave 1", r));
    b.add("impulse.w3_extension", r >= 1.618 * 0.97 ? "pass" : "fail", `Wave 3 measured ${pc(r)} of wave 1.`, { ratio: r3(r) });
  }
  if (p.length >= 5) {
    const r4 = len(p, 4) / len(p, 3);
    b.fibs.push(fib("w4/w3", "Wave 4 retracement of wave 3", r4));
    b.add("impulse.w4_depth", r4 >= 0.146 && r4 <= 0.382 * 1.03 ? "pass" : "fail", `Wave 4 retraced ${pc(r4)} of wave 3.`, { ratio: r3(r4) });
    const r2 = len(p, 2) / len(p, 1);
    const t2 = p[2].index - p[1].index, t4 = p[4].index - p[3].index;
    const depthAlt = (r2 >= 0.5 && r4 <= 0.382) || (r2 <= 0.382 && r4 >= 0.5);
    const timeAlt = Math.max(t2, t4) / Math.max(1, Math.min(t2, t4)) >= 1.618;
    b.add("impulse.alternation", depthAlt || timeAlt ? "pass" : "fail",
      `Wave 2 retraced ${pc(r2)} over ${t2} bars; wave 4 retraced ${pc(r4)} over ${t4} bars${depthAlt ? " (alternation in depth)" : timeAlt ? " (alternation in time)" : ""}.`,
      { w2_retrace: r3(r2), w4_retrace: r3(r4), w2_bars: t2, w4_bars: t4 });
  } else {
    b.add("impulse.alternation", "pending", "Needs the end of wave 4.");
  }
  if (p.length === 6) {
    const l1 = len(p, 1), l3 = len(p, 3), l5 = len(p, 5);
    const sorted = [["1", l1], ["3", l3], ["5", l5]].sort((x, y) => (y[1] as number) - (x[1] as number)) as [string, number][];
    const ext = sorted[0][1] / sorted[1][1] >= 1.382 ? sorted[0][0] : null;
    b.add("impulse.extension", ext ? "pass" : "fail",
      ext ? `Wave ${ext} is extended: ${pc(sorted[0][1] / sorted[1][1])} of the next longest.` : "No actionary wave is clearly extended (none is 138.2% of the next longest).",
      { longest_vs_next: r3(sorted[0][1] / sorted[1][1]) });
    if (ext === "3") {
      const r = l5 / l1;
      b.add("impulse.equality", r >= 0.9 && r <= 1.1 || Math.abs(r - 0.618) <= 0.05 ? "pass" : "fail", `Wave 5 is ${pc(r)} of wave 1.`, { ratio: r3(r) });
    } else b.add("impulse.equality", "pending", "Applies only when wave 3 is the extended wave.");
    const trunc = !beyond(p[5].price, p[3].price, dir);
    b.add("impulse.no_truncation", trunc ? "fail" : "pass", trunc ? `Wave 5 ended at ${fmt(p[5].price)}, short of wave 3's ${fmt(p[3].price)} (truncated fifth).` : "Wave 5 exceeded the end of wave 3.");
    b.fibs.push(fib("w5/w1", "Wave 5 as a multiple of wave 1", l5 / l1));
    b.fibs.push(fib("w5/w1-3", "Wave 5 as a multiple of the 1–3 advance", l5 / Math.abs(p[3].price - p[0].price)));
  }
  return finish(b, "impulse", null, dir, L, p, 6, opts);
}

/** Rules shared by impulses and diagonals. */
function motiveCore(b: Builder, p: WavePoint[], dir: Direction) {
  if (p.length >= 3) {
    const ok = beyond(p[2].price, p[0].price, dir);
    b.add("motive.w2_lt_100", ok ? "pass" : "fail",
      ok ? `Wave 2 retraced ${pc(len(p, 2) / len(p, 1))} of wave 1.` : `Wave 2 went beyond the start of wave 1 (${fmt(p[2].price)} vs ${fmt(p[0].price)}).`,
      { retrace: r3(len(p, 2) / len(p, 1)) });
  } else b.add("motive.w2_lt_100", "pending", "Needs the end of wave 2.");

  if (p.length >= 4) {
    const ok = beyond(p[3].price, p[1].price, dir);
    b.add("motive.w3_beyond_w1", ok ? "pass" : "fail",
      ok ? `Wave 3 ended at ${fmt(p[3].price)}, beyond wave 1's ${fmt(p[1].price)}.` : `Wave 3 ended at ${fmt(p[3].price)}, short of wave 1's ${fmt(p[1].price)}.`,
      { w3_end: p[3].price, w1_end: p[1].price });
  } else b.add("motive.w3_beyond_w1", "pending", "Needs the end of wave 3.");

  if (p.length >= 5) {
    const ok = beyond(p[4].price, p[2].price, dir);
    b.add("motive.w4_lt_100", ok ? "pass" : "fail",
      ok ? `Wave 4 retraced ${pc(len(p, 4) / len(p, 3))} of wave 3.` : `Wave 4 went beyond the start of wave 3.`, { retrace: r3(len(p, 4) / len(p, 3)) });
  } else b.add("motive.w4_lt_100", "pending", "Needs the end of wave 4.");

  if (p.length === 6) {
    const [a1, a3, a5] = [len(p, 1), len(p, 3), len(p, 5)];
    const [g1, g3, g5] = [lpct(p, 1), lpct(p, 3), lpct(p, 5)];
    const arith = !(a3 < a1 && a3 < a5), pctOk = !(g3 < g1 && g3 < g5);
    b.add("motive.w3_not_shortest", arith || pctOk ? "pass" : "fail",
      arith || pctOk
        ? `Wave 3 (${fmt(a3)}) is not the shortest${arith ? "" : " on a percentage basis"}.`
        : `Wave 3 (${fmt(a3)}) is shorter than both wave 1 (${fmt(a1)}) and wave 5 (${fmt(a5)}), in price and in percent.`,
      { w1: a1, w3: a3, w5: a5, w1_pct: r3(g1), w3_pct: r3(g3), w5_pct: r3(g5) });
  } else b.add("motive.w3_not_shortest", "pending", "Needs the end of wave 5.");
}

/** While wave 5 is in progress: if wave 3 is shorter than wave 1, wave 5 must stay shorter than wave 3. */
function capWave5(b: Builder, p: WavePoint[], dir: Direction) {
  const a1 = len(p, 1), a3 = len(p, 3), g1 = lpct(p, 1), g3 = lpct(p, 3);
  if (a3 >= a1 && g3 >= g1) return; // wave 3 already beats wave 1: no cap
  const s = dir === "up" ? 1 : -1;
  const arithCap = a3 < a1 ? p[4].price + s * a3 : Infinity * s;
  const pctCap = g3 < g1 ? p[4].price * Math.exp(s * g3) : Infinity * s;
  // the rule fails only if both bases fail, so the binding level is the farther of the two
  const cap = dir === "up" ? Math.max(arithCap, pctCap) : Math.min(arithCap, pctCap);
  if (Number.isFinite(cap)) b.inv(cap, Builder.side(dir), "rule", "wave 5 would become longer than wave 3, making wave 3 the shortest", "motive.w3_not_shortest");
}

// ------------------------------------------------------------------------------------------ diagonal

export function validateDiagonal(p: WavePoint[], position: "leading" | "ending", opts: ValidateOptions = {}): Validation {
  need(p, 2, 6, "A diagonal");
  const pattern: Pattern = position === "leading" ? "leading_diagonal" : "ending_diagonal";
  const attempt = (shape: "contracting" | "expanding") => {
    const dir = dirOf(p), b = new Builder(), S = Builder.side(opp(dir));
    structural(b, p, dir, MOTIVE_LABELS, opts);
    motiveCore(b, p, dir);
    const id = shape === "contracting" ? "diagonal.contracting" : "diagonal.expanding";
    const lens = p.slice(1).map((_, i) => len(p, i + 1));
    const cmp = (a: number, c: number) => (shape === "contracting" ? a < c : a > c);
    const fails: string[] = [];
    if (lens.length >= 3 && !cmp(lens[2], lens[0])) fails.push(`wave 3 ${shape === "contracting" ? "is not shorter" : "is not longer"} than wave 1`);
    if (lens.length >= 4 && !cmp(lens[3], lens[1])) fails.push(`wave 4 ${shape === "contracting" ? "is not shorter" : "is not longer"} than wave 2`);
    if (lens.length >= 5 && !cmp(lens[4], lens[2])) fails.push(`wave 5 ${shape === "contracting" ? "is not shorter" : "is not longer"} than wave 3`);
    b.add(id, fails.length ? "fail" : lens.length >= 5 ? "pass" : "pending",
      fails.length ? `Not ${shape}: ${fails.join("; ")}.` : lens.length >= 5 ? `Waves 1–5 fit a ${shape} wedge.` : `Consistent with a ${shape} wedge so far.`,
      Object.fromEntries(lens.map((l, i) => [`w${i + 1}`, l])));
    if (p.length >= 5) {
      const ov = !beyond(p[4].price, p[1].price, dir);
      b.add("diagonal.w4_overlaps_w1", ov ? "pass" : "fail", ov ? "Wave 4 entered wave 1 territory." : "Wave 4 stayed out of wave 1 territory (unusual for a diagonal).");
    }
    if (p.length === 6) {
      const t = beyond(p[5].price, p[3].price, dir);
      b.add("diagonal.w5_beyond_w3", t ? "pass" : "fail", t ? "Wave 5 ended beyond wave 3." : "Wave 5 ended short of wave 3.");
    }
    const k = p.length - 1;
    if (k === 1 || k === 2) b.inv(p[0].price, S, "rule", "wave 2 cannot retrace beyond the start of wave 1", "motive.w2_lt_100");
    if (k === 3) b.inv(p[2].price, S, "rule", "wave 4 cannot retrace beyond the start of wave 3", "motive.w4_lt_100");
    if (k === 4) {
      const s = dir === "up" ? 1 : -1;
      if (shape === "contracting") b.inv(p[4].price + s * lens[2], Builder.side(dir), "rule", "wave 5 must stay shorter than wave 3 in a contracting diagonal", "diagonal.contracting");
      else b.inv(p[3].price, S, "count", "an expanding diagonal's wave 5 must exceed wave 3");
    }
    if (k === 3 && shape === "contracting") {
      const s = dir === "up" ? 1 : -1;
      b.inv(p[3].price - s * lens[1], S, "rule", "wave 4 must stay shorter than wave 2 in a contracting diagonal", "diagonal.contracting");
    }
    return finish(b, pattern, shape, dir, MOTIVE_LABELS, p, 6, opts);
  };
  const c = attempt("contracting"), e = attempt("expanding");
  if (c.valid && !e.valid) return c;
  if (e.valid && !c.valid) return e;
  if (c.valid && e.valid) return { ...c, subtype: p.length < 4 ? null : c.subtype }; // undecided before wave 3 ends
  return c.ruleViolations.length <= e.ruleViolations.length ? c : e;
}

// ------------------------------------------------------------------------------------------ zigzag

const ABC = ["A", "B", "C"];

/** Points q0 (start of A) … q3 (end of C); at least q0 and q1. */
export function validateZigzag(p: WavePoint[], opts: ValidateOptions = {}): Validation {
  need(p, 2, 4, "A zigzag");
  const dir = dirOf(p), b = new Builder(), S = Builder.side(opp(dir));
  structural(b, p, dir, ABC, opts);
  if (p.length >= 3) {
    const r = len(p, 2) / len(p, 1), ok = beyond(p[2].price, p[0].price, dir);
    b.add("zigzag.b_lt_100", ok ? "pass" : "fail", ok ? `Wave B retraced ${pc(r)} of wave A.` : `Wave B went beyond the start of wave A (${pc(r)}).`, { retrace: r3(r) });
    b.fibs.push(fib("b/a", "Wave B retracement of wave A", r));
    b.add("zigzag.b_depth", r >= 0.382 && r <= 0.854 ? "pass" : "fail", `Wave B retraced ${pc(r)} of wave A.`, { ratio: r3(r) });
    b.add("zigzag.not_flat", r < 0.9 ? "pass" : "fail", r < 0.9 ? "Wave B is shallow enough for a zigzag." : "Wave B retraced 90% or more; a flat fits better.", { ratio: r3(r) });
  } else b.add("zigzag.b_lt_100", "pending", "Needs the end of wave B.");
  if (p.length === 4) {
    const t = beyond(p[3].price, p[1].price, dir), r = len(p, 3) / len(p, 1);
    b.add("zigzag.c_beyond_a", t ? "pass" : "fail", t ? "Wave C ended beyond wave A." : "Wave C ended short of wave A (truncated).");
    b.fibs.push(fib("c/a", "Wave C as a multiple of wave A", r));
    const near = [0.618, 1, 1.236].some((f) => Math.abs(r - f) <= 0.05 * f);
    b.add("zigzag.c_vs_a", near ? "pass" : "fail", `Wave C measured ${pc(r)} of wave A.`, { ratio: r3(r) });
  }
  const k = p.length - 1;
  if (k === 1 || k === 2) b.inv(p[0].price, S, "rule", "wave B cannot go beyond the start of wave A", "zigzag.b_lt_100");
  if (k === 2) b.inv(p[2].price, S, "count", "a move beyond the wave B extreme means wave B has not ended");
  return finish(b, "zigzag", null, dir, ABC, p, 4, opts);
}

// ------------------------------------------------------------------------------------------ flat

export function validateFlat(p: WavePoint[], opts: ValidateOptions = {}): Validation {
  need(p, 2, 4, "A flat");
  const dir = dirOf(p), b = new Builder();
  structural(b, p, dir, ABC, opts);
  let subtype: string | null = null;
  if (p.length >= 3) {
    const r = len(p, 2) / len(p, 1);
    const ok = r >= 0.9;
    b.add("flat.b_ge_90", ok ? "pass" : "fail",
      ok ? `Wave B retraced ${pc(r)} of wave A.` : `Wave B retraced only ${pc(r)} of wave A.`, { retrace: r3(r) });
    b.fibs.push(fib("b/a", "Wave B retracement of wave A", r));
    if (p.length === 4) {
      const c = len(p, 3) / len(p, 1), pastA = beyond(p[3].price, p[1].price, dir);
      if (r > 1.05 && pastA) subtype = "expanded";
      else if (r > 1 && !pastA) subtype = "running";
      else subtype = "regular";
      const shapeOk = subtype === "expanded" ? c >= 1.1 : subtype === "running" ? true : pastA && c <= 1.382;
      b.add("flat.c_shape", shapeOk ? "pass" : "fail",
        `${subtype[0].toUpperCase()}${subtype.slice(1)} flat: B = ${pc(r)} of A, C = ${pc(c)} of A${pastA ? ", beyond A's end" : ", short of A's end"}.`,
        { b_ratio: r3(r), c_ratio: r3(c) });
      b.fibs.push(fib("c/a", "Wave C as a multiple of wave A", c));
      const band = subtype === "expanded" ? [1.236, 1.618] : subtype === "running" ? [0.618, 1] : [0.618, 1.236];
      b.add("flat.c_vs_ab", c >= band[0] * 0.97 && c <= band[1] * 1.03 ? "pass" : "fail", `Wave C measured ${pc(c)} of wave A (typical for ${subtype}: ${pc(band[0])}–${pc(band[1])}).`, { ratio: r3(c) });
    }
  } else b.add("flat.b_ge_90", "pending", "Needs the end of wave B.");
  if (p.length === 2) b.inv(p[1].price, Builder.side(dir), "count", "a move beyond the end of wave A means wave A has not ended");
  return finish(b, "flat", subtype, dir, ABC, p, 4, opts);
}

// ------------------------------------------------------------------------------------------ triangle

const ABCDE = ["A", "B", "C", "D", "E"];

/** Points t0 (start of A) … t5 (end of E); at least t0 and t1. */
export function validateTriangle(p: WavePoint[], opts: ValidateOptions = {}): Validation {
  need(p, 2, 6, "A triangle");
  const attempt = (shape: "contracting" | "expanding") => {
    const dir = dirOf(p), b = new Builder();
    structural(b, p, dir, ABCDE, opts);
    // leg n (n ≥ 3) ends short of (contracting) or beyond (expanding) the end of leg n-2
    const fails: string[] = [];
    for (let n = 3; n < p.length; n++) {
      const legDir = n % 2 === 1 ? dir : opp(dir);
      const past = beyond(p[n].price, p[n - 2].price, legDir);
      if (shape === "contracting" ? past : !past) fails.push(`${ABCDE[n - 1]} ${shape === "contracting" ? "went beyond" : "fell short of"} the end of ${ABCDE[n - 3]}`);
    }
    const id = shape === "contracting" ? "triangle.contracting" : "triangle.expanding";
    b.add(id, fails.length ? "fail" : p.length >= 6 ? "pass" : "pending",
      fails.length ? `Not ${shape}: ${fails.join("; ")}.` : p.length >= 6 ? `All five legs fit a ${shape} triangle.` : `Consistent with a ${shape} triangle so far.`);
    let subtype: string = shape;
    if (shape === "contracting" && p.length >= 3) {
      if (beyond(p[2].price, p[0].price, opp(dir))) subtype = "running";
      if (p.length >= 5 && Math.abs(p[4].price - p[2].price) <= 0.01 * Math.abs(p[2].price)) subtype = "barrier";
      const ratios = p.slice(2).map((_, i) => len(p, i + 2) / len(p, i + 1));
      ratios.forEach((r, i) => b.fibs.push(fib(`${ABCDE[i + 1]}/${ABCDE[i]}`.toLowerCase(), `Wave ${ABCDE[i + 1]} as a share of wave ${ABCDE[i]}`, r)));
      if (ratios.length) {
        const inBand = ratios.filter((r) => r >= 0.55 && r <= 0.9).length;
        b.add("triangle.leg_ratio", inBand === ratios.length ? "pass" : "fail", `${inBand} of ${ratios.length} legs are 55%–90% of the leg before.`);
      }
    }
    // invalidation for the leg in progress (contracting only: expanding legs have minimums, not maximums)
    const n = p.length; // the next leg is leg n (1-based among legs), ending at point p[n]
    if (shape === "contracting" && n >= 3 && n <= 5) {
      const legDir = n % 2 === 1 ? dir : opp(dir);
      b.inv(p[n - 2].price, Builder.side(legDir), "rule", `wave ${ABCDE[n - 1]} cannot go beyond the end of wave ${ABCDE[n - 3]}`, "triangle.contracting");
    }
    return finish(b, "triangle", subtype, dir, ABCDE, p, 6, opts);
  };
  const c = attempt("contracting"), e = attempt("expanding");
  if (c.valid && !e.valid) return c;
  if (e.valid && !c.valid) return e;
  if (c.valid && e.valid) return { ...c, subtype: null }; // not distinguishable yet
  return c.ruleViolations.length <= e.ruleViolations.length ? c : e;
}

// ------------------------------------------------------------------------------------------ combination

const WXY = ["W", "X", "Y", "X", "Z"];

/**
 * Points: start of W, end of W, end of X, end of Y (and optionally end of the second X and of Z).
 * `components` are the validated lower-degree patterns for W, Y (and Z), when known. Without them the
 * component rules report "unverified" rather than passing.
 */
export function validateCombination(p: WavePoint[], components: (Validation | null)[] = [], opts: ValidateOptions = {}): Validation {
  need(p, 2, 6, "A combination");
  const dir = dirOf(p), b = new Builder(), S = Builder.side(opp(dir));
  structural(b, p, dir, WXY, opts);
  b.add("combo.max_three", "pass", `${Math.ceil((p.length - 1) / 2)} corrective component(s) labeled so far.`);
  const expected = Math.ceil((p.length - 1) / 2);
  const comps = components.slice(0, expected);
  const corrective: Pattern[] = ["zigzag", "flat", "triangle", "combination"];
  if (comps.length < expected || comps.some((c) => c == null)) {
    b.add("combo.components_corrective", "unverified", "The internal structure of W, Y and Z has not been checked at the lower degree.");
  } else {
    const bad = comps.findIndex((c) => !c!.valid || !corrective.includes(c!.pattern));
    b.add("combo.components_corrective", bad < 0 ? "pass" : "fail",
      bad < 0 ? `Components: ${comps.map((c) => c!.pattern).join(", ")}.` : `Component ${["W", "Y", "Z"][bad]} is not a valid corrective pattern.`);
  }
  const triIdx = comps.findIndex((c) => c?.pattern === "triangle");
  b.add("combo.triangle_last", triIdx < 0 || triIdx === expected - 1 ? "pass" : "fail",
    triIdx < 0 ? "No triangle component." : triIdx === expected - 1 ? "The triangle is the last component." : "A triangle appears before the last component.");
  const isDzz = comps.length >= 2 && comps.every((c) => c?.pattern === "zigzag");
  if (p.length >= 3) {
    const rx = len(p, 2) / len(p, 1);
    b.fibs.push(fib("x/w", "Wave X retracement of wave W", rx));
    b.add("combo.x_depth", rx >= 0.5 && rx <= 0.854 ? "pass" : "fail", `Wave X retraced ${pc(rx)} of wave W.`, { ratio: r3(rx) });
    if (isDzz) {
      const ok = beyond(p[2].price, p[0].price, dir);
      b.add("combo.dzz_x", ok ? "pass" : "fail", ok ? "Wave X stayed short of the start of W." : "Wave X went beyond the start of W.");
    }
  }
  if (p.length >= 4) {
    const ry = len(p, 3) / len(p, 1);
    b.fibs.push(fib("y/w", "Wave Y as a multiple of wave W", ry));
    const near = [0.618, 1, 1.236].some((f) => Math.abs(ry - f) <= 0.05 * f);
    b.add("combo.y_vs_w", near && ry <= 1.618 ? "pass" : "fail", `Wave Y measured ${pc(ry)} of wave W.`, { ratio: r3(ry) });
  }
  if (p.length === 3 && isDzz) b.inv(p[0].price, S, "rule", "wave X of a double zigzag cannot go beyond the start of W", "combo.dzz_x");
  return finish(b, "combination", isDzz ? "double_zigzag" : p.length >= 5 ? "triple_three" : "double_three", dir, WXY, p, p.length >= 5 ? 6 : 4, opts);
}

/** Validate a proposed count by pattern name. */
export function validate(pattern: Pattern, points: WavePoint[], opts: ValidateOptions = {}): Validation {
  switch (pattern) {
    case "impulse": return validateImpulse(points, opts);
    case "leading_diagonal": return validateDiagonal(points, "leading", opts);
    case "ending_diagonal": return validateDiagonal(points, "ending", opts);
    case "zigzag": return validateZigzag(points, opts);
    case "flat": return validateFlat(points, opts);
    case "triangle": return validateTriangle(points, opts);
    case "combination": return validateCombination(points, [], opts);
  }
}
