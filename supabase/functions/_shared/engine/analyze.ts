/**
 * One entry point for the whole engine: pivots → candidate counts → Fibonacci levels and zones, in the
 * compact form stored in analysis_results. The analysis-worker stores exactly this, and the app runs it
 * live when the cache is missing or stale, so both paths produce identical results.
 */
import { DEGREES, analyzePivots, compact, swingStructure, type Degree, type PivotBar, type Timeframe } from "./pivots.ts";
import { compactSet, generateCandidates, type CandidateSet, type CompactCandidateSet } from "./candidates.ts";
import { analyzeFib, type FibLevel } from "./fib.ts";
import { ANALYSIS_VERSION } from "./version.ts";

export { ANALYSIS_VERSION };

/** Attach each candidate's Fibonacci targets (not yet reached, nearest first, at most 6). */
export function withTargets(set: CompactCandidateSet, targets: Record<string, FibLevel[]>): CompactCandidateSet {
  return {
    ...set,
    c: set.c.map((c) => {
      const anchor = c.p[c.p.length - 1][1];
      const t = (targets[c.id] ?? []).filter((l) => !l.reached)
        .sort((x, y) => Math.abs(x.price - anchor) - Math.abs(y.price - anchor) || (x.label < y.label ? -1 : 1)).slice(0, 6)
        .map((l) => [Math.round(l.price * 1e4) / 1e4, l.label, l.primary] as [number, string, boolean]);
      return { ...c, tg: t };
    }),
  };
}

export function computeAnalysis(bars: PivotBar[], timeframe: Timeframe) {
  const a = analyzePivots(bars, timeframe);
  const sets = Object.fromEntries(DEGREES.map((d) => {
    const s = a.degrees[d];
    return [d, generateCandidates({ timeframe, degree: d, pivots: s.pivots, bars, pending: s.pending })];
  })) as Record<Degree, CandidateSet>;
  const fib = analyzeFib({
    bars,
    pivots: Object.fromEntries(DEGREES.map((d) => [d, a.degrees[d].pivots])) as Record<Degree, typeof a.degrees.minor.pivots>,
    pending: Object.fromEntries(DEGREES.map((d) => [d, a.degrees[d].pending])) as Record<Degree, typeof a.degrees.minor.pending>,
    candidates: sets,
  });
  const round = (x: number) => Math.round(x * 1e4) / 1e4;
  return {
    pivots: a,
    pivots_json: Object.fromEntries(DEGREES.map((d) => {
      const s = a.degrees[d];
      return [d, { params: s.params, pivots: s.pivots.map(compact), pending: s.pending }];
    })),
    swing_structure: Object.fromEntries(DEGREES.map((d) => [d, swingStructure(a.degrees[d].pivots).structure])),
    candidate_counts_json: Object.fromEntries(DEGREES.map((d) => [d, withTargets(compactSet(sets[d]), fib.targets)])) as Record<Degree, CompactCandidateSet>,
    candidate_count: DEGREES.reduce((n, d) => n + sets[d].candidates.length, 0),
    /** Level counts only; the full list is recomputable and would triple the row size. */
    fib_level_counts: Object.fromEntries(DEGREES.map((d) => [d, fib.levels[d].filter((l) => !l.reached).length])),
    confluence_zones_json: { close: fib.close, tolerance: round(fib.tolerance), zones: fib.zones },
  };
}
