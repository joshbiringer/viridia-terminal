/**
 * App-side view of candidate wave counts (engine Phase 5) and their Fibonacci targets (Phase 6).
 * The engine lives in supabase/functions/_shared/engine, shared with the analysis-worker and the tests.
 */
import { CANDIDATES_VERSION, PATTERN_LABEL, type CandidatePattern, type CandidateSet, type CompactCandidateSet } from "@engine/candidates";
import { ANALYSIS_VERSION, computeAnalysis } from "@engine/analyze";
import type { ConfluenceZone } from "@engine/fib";
import { DEGREES, type Degree, type PivotBar, type Timeframe } from "@engine/pivots";
import { RULEBOOK } from "@engine/rules";
import { PERSONALITY, band, decodeFactors, type ConfidenceBand } from "@engine/rank";
import { GLANCE_DEGREES, glanceOf, type Glance } from "@engine/glance";

export { ANALYSIS_VERSION, CANDIDATES_VERSION, PATTERN_LABEL, GLANCE_DEGREES };
export type { CandidatePattern, ConfluenceZone, Glance, ConfidenceBand };

export const CANDIDATE_METHOD =
  "Every chain of 3–6 alternating pivots ending at the latest confirmed pivot is tested as each pattern; only counts with zero hard-rule failures are kept, then ranked by Pattern Confidence.";

export const RANK_METHOD =
  "Pattern Confidence = (guidelines met + 2) ÷ (guidelines measured + 4), from the rulebook's guidelines, Fibonacci tendencies and wave-personality checks (wave 3 speed and volume, wave 5 volume, alternation in time, a start at the prior extreme). It ranks the rule-valid counts against each other; it is not a probability of any outcome.";

export const BAND_LABEL: Record<ConfidenceBand, string> = { high: "High", medium: "Medium", low: "Low" };
export { band };

/** Plain-language text for an evidence factor id. */
export const factorText = (id: string) =>
  RULEBOOK.find((r) => r.id === id)?.text ?? (PERSONALITY as Record<string, { text: string }>)[id]?.text ?? id;

export const FIB_METHOD =
  "Targets come from the Fibonacci relationships the sources describe for the wave in progress, Elliott trend channels, the prior fourth wave of lesser degree, and 38.2–78.6% retracements of the latest swing. A zone is where two or more independent relationships fall within max(¼ ATR, 0.4%) of each other; strength counts them, weighting primary ratios and higher degrees. It is not a probability.";

export interface ClientTarget { price: number; label: string; primary: boolean }

/** A candidate count as sent to the browser. */
export interface ClientCandidate {
  id: string;
  pattern: CandidatePattern;
  subtype: string | null;
  direction: "up" | "down";
  complete: boolean;
  points: { ts: string; price: number; label: string }[];
  next: { label: string; direction: "up" | "down"; hold: number | null; holdSide: "above" | "below" | null; holdReason: string | null };
  invalidation: number | null;
  evidence: { passed: number; evaluated: number; fibMatches: number; fibTotal: number };
  targets: ClientTarget[];
  /** Pattern Confidence (0–100), null for analyses made before ranking existed. */
  score: number | null;
  /** Evidence behind the score. Factors are stored for the preferred and alternate counts only. */
  confidence: { passed: number; evaluated: number; factors: { id: string; text: string; pass: boolean }[] | null } | null;
}

export interface ClientCandidateSet {
  anchor: CandidateSet["anchor"];
  examined: number;
  eliminated: number;
  eliminatedBy: { ruleId: string; text: string; count: number }[];
  truncated: boolean;
  candidates: ClientCandidate[];
}

export type ClientCandidates = Record<Degree, ClientCandidateSet>;

export interface ClientFib { close: number; tolerance: number; zones: ConfluenceZone[] }

const LABELS: Record<CandidatePattern, string[]> = {
  impulse: ["0", "1", "2", "3", "4", "5"], leading_diagonal: ["0", "1", "2", "3", "4", "5"], ending_diagonal: ["0", "1", "2", "3", "4", "5"],
  zigzag: ["0", "A", "B", "C"], flat: ["0", "A", "B", "C"], triangle: ["0", "A", "B", "C", "D", "E"],
};
const ruleText = (id: string) => RULEBOOK.find((r) => r.id === id)?.text ?? id;

export function fromCompactSet(s: CompactCandidateSet | null | undefined): ClientCandidateSet {
  if (!s) return { anchor: null, examined: 0, eliminated: 0, eliminatedBy: [], truncated: false, candidates: [] };
  return {
    anchor: s.a, examined: s.x, eliminated: s.e, truncated: s.t,
    eliminatedBy: s.eb.map((e) => ({ ...e, text: ruleText(e.ruleId) })),
    candidates: s.c.map((c) => ({
      id: c.id, pattern: c.pt, subtype: c.st, direction: c.d === "u" ? "up" : "down", complete: c.c,
      points: c.p.map(([ts, price], i) => ({ ts, price, label: LABELS[c.pt][i] })),
      next: { label: c.nx.l, direction: c.nx.d === "u" ? "up" : "down", hold: c.nx.h, holdSide: c.nx.hs, holdReason: c.nx.hr },
      invalidation: c.inv,
      evidence: { passed: c.ev[0], evaluated: c.ev[1], fibMatches: c.ev[2], fibTotal: c.ev[3] },
      targets: (c.tg ?? []).map(([price, label, primary]) => ({ price, label, primary })),
      score: c.sc ?? null,
      confidence: c.rk ? {
        passed: c.rk[0], evaluated: c.rk[1],
        factors: c.fx ? decodeFactors(c.fx).map((f) => ({ ...f, text: factorText(f.id) })) : null,
      } : null,
    })),
  };
}

/** Preferred/alternate summary for every degree, plus the automatic choice. */
export type Glances = { auto: Glance | null } & Record<Degree, Glance | null>;
export function glancesOf(sets: Partial<Record<Degree, CompactCandidateSet | null>>): Glances {
  return {
    auto: glanceOf(sets),
    ...Object.fromEntries(DEGREES.map((d) => [d, sets[d]?.c?.length ? glanceOf({ [d]: sets[d] }, d) : null])),
  } as Glances;
}

export function candidatesForClient(bars: PivotBar[], timeframe: Timeframe): { candidates: ClientCandidates; fib: ClientFib; glances: Glances } {
  const r = computeAnalysis(bars, timeframe);
  return {
    candidates: Object.fromEntries(DEGREES.map((d) => [d, fromCompactSet(r.candidate_counts_json[d])])) as ClientCandidates,
    fib: r.confluence_zones_json,
    glances: glancesOf(r.candidate_counts_json),
  };
}
