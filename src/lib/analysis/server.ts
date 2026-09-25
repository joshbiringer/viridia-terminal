import { db } from "@/lib/supabase";
import type { BarRow } from "@/lib/market-data/bars";
import { DEGREES, fromCompact, pivotsForClient, type ClientPivots, type Degree } from "./pivots";
import { ANALYSIS_VERSION, candidatesForClient, fromCompactSet, type ClientCandidates, type ClientFib } from "./candidates";
import type { CompactCandidateSet } from "@engine/candidates";
import type { ConfluenceZone } from "@engine/fib";

export interface SwingSummary {
  source: "cache" | "live";
  asOf: string;
  bars: number;
  pivots: ClientPivots;
  candidates: ClientCandidates;
  fib: ClientFib | null;
  version: string;
}

type Cached = {
  current: boolean; algorithm_version: string; analysis_timestamp: string; input_bars: number;
  pivots: Record<Degree, Parameters<typeof fromCompact>[0]>;
  candidates: Record<Degree, CompactCandidateSet> | null;
  zones: { close: number; tolerance: number; zones: ConfluenceZone[] } | null;
};

/**
 * Daily analysis for one symbol (swings, candidate wave counts, Fibonacci zones): the cached engine
 * result when it is current with stored bars and was produced by this engine version, otherwise
 * computed now from the same bars the chart uses. Both paths run the same engine code.
 */
export async function getDailyAnalysis(symbol: string): Promise<SwingSummary | null> {
  const cached = await db().rpc("get_analysis", { p_symbol: symbol, p_timeframe: "1d" });
  const c = cached.data as Cached | null;
  if (c && c.current && c.algorithm_version === ANALYSIS_VERSION && c.pivots && c.candidates) {
    const degrees = Object.fromEntries(DEGREES.map((d) => [d, fromCompact(c.pivots[d])])) as ClientPivots["degrees"];
    const candidates = Object.fromEntries(DEGREES.map((d) => [d, fromCompactSet(c.candidates![d])])) as ClientCandidates;
    return {
      source: "cache", asOf: c.analysis_timestamp, bars: c.input_bars, version: ANALYSIS_VERSION,
      pivots: { version: ANALYSIS_VERSION.split("+")[0], degrees }, candidates, fib: c.zones,
    };
  }
  const { data } = await db().rpc("get_bars", { p_symbol: symbol, p_timeframe: "1d", p_limit: 600 });
  const bars = (data ?? []) as BarRow[];
  if (!bars.length) return null;
  const live = candidatesForClient(bars, "1d");
  return {
    source: "live", asOf: bars.at(-1)!.ts, bars: bars.length, version: ANALYSIS_VERSION,
    pivots: pivotsForClient(bars, "1d"), candidates: live.candidates, fib: live.fib,
  };
}
