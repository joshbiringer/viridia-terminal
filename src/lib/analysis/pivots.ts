/**
 * App-side view of the pivot engine. The engine itself lives in supabase/functions/_shared/engine
 * so the Edge Function, the app and the tests share one implementation.
 */
import {
  DEGREES, PIVOT_ALGORITHM_VERSION, SWING_LABEL, analyzePivots, swingStructure,
  type Degree, type PendingSwing, type PivotBar, type SwingStructure, type Timeframe,
} from "@engine/pivots";

export { DEGREES, PIVOT_ALGORITHM_VERSION, SWING_LABEL };
export type { Degree, SwingStructure };

export const DEGREE_LABEL: Record<Degree, string> = { minor: "Minor", intermediate: "Intermediate", primary: "Primary" };

export const PIVOT_METHOD =
  "Adaptive ZigZag: a swing is confirmed only after price reverses by max(timeframe floor, ATR(14) multiple), on a later bar. Pivots are never revised after confirmation.";

/** A pivot as sent to the browser. `label` compares it with the previous pivot of the same type. */
export interface ClientPivot {
  ts: string;
  price: number;
  type: "high" | "low";
  label: "HH" | "LH" | "HL" | "LL" | "H" | "L";
  confirmedTs: string;
  swingPct: number | null;
  prominencePct: number | null;
}

export interface ClientPivotSeries {
  pivots: ClientPivot[];
  pending: PendingSwing | null;
  structure: SwingStructure;
  thresholdPct: number | null;
}

export interface ClientPivots {
  version: string;
  degrees: Record<Degree, ClientPivotSeries>;
}

export function pivotsForClient(bars: PivotBar[], timeframe: Timeframe): ClientPivots {
  const a = analyzePivots(bars, timeframe);
  const degrees = Object.fromEntries(DEGREES.map((d) => {
    const s = a.degrees[d];
    const lastOf: Partial<Record<"high" | "low", number>> = {};
    const pivots: ClientPivot[] = s.pivots.map((p) => {
      const prev = lastOf[p.type];
      lastOf[p.type] = p.price;
      const label: ClientPivot["label"] = prev == null ? (p.type === "high" ? "H" : "L")
        : p.type === "high" ? (p.price > prev ? "HH" : "LH") : (p.price > prev ? "HL" : "LL");
      return {
        ts: p.ts, price: p.price, type: p.type, label, confirmedTs: p.confirmedTs,
        swingPct: p.magnitude?.pct ?? null, prominencePct: p.prominence?.pct ?? null,
      };
    });
    return [d, { pivots, pending: s.pending, structure: swingStructure(s.pivots).structure, thresholdPct: s.pending?.threshold ?? null }];
  })) as Record<Degree, ClientPivotSeries>;
  return { version: PIVOT_ALGORITHM_VERSION, degrees };
}

/** Rebuilds the client form from a cached analysis_results.pivots_json degree entry. */
export function fromCompact(entry: { pivots: import("@engine/pivots").CompactPivot[]; pending: PendingSwing | null }): ClientPivotSeries {
  const lastOf: Partial<Record<"H" | "L", number>> = {};
  const pivots: ClientPivot[] = entry.pivots.map((c) => {
    const prev = lastOf[c.k];
    lastOf[c.k] = c.p;
    const type = c.k === "H" ? "high" : "low";
    const label: ClientPivot["label"] = prev == null ? c.k : c.k === "H" ? (c.p > prev ? "HH" : "LH") : (c.p > prev ? "HL" : "LL");
    return { ts: c.t, price: c.p, type, label, confirmedTs: c.c, swingPct: c.m, prominencePct: c.pr };
  });
  const highs = pivots.filter((p) => p.type === "high").slice(-2), lows = pivots.filter((p) => p.type === "low").slice(-2);
  let structure: SwingStructure = "insufficient";
  if (highs.length === 2 && lows.length === 2) {
    const hh = highs[1].price > highs[0].price, hl = lows[1].price > lows[0].price;
    structure = hh && hl ? "higher_highs_lows" : !hh && !hl ? "lower_highs_lows" : hh ? "expanding" : "contracting";
  }
  return { pivots, pending: entry.pending, structure, thresholdPct: entry.pending?.threshold ?? null };
}
