import { db } from "@/lib/supabase";
import type { BarRow } from "@/lib/market-data/bars";
import { DEGREES, fromCompact, pivotsForClient, type ClientPivots, type Degree } from "./pivots";

export interface SwingSummary {
  source: "cache" | "live";
  asOf: string;
  bars: number;
  pivots: ClientPivots;
}

type Cached = {
  current: boolean; algorithm_version: string; analysis_timestamp: string; input_bars: number;
  pivots: Record<Degree, Parameters<typeof fromCompact>[0]>;
};

/**
 * Daily swing structure for one symbol: the cached engine result when it is current with stored bars,
 * otherwise computed now from the same bars the chart uses. Both paths run the same engine version.
 */
export async function getDailySwings(symbol: string, version: string): Promise<SwingSummary | null> {
  const cached = await db().rpc("get_analysis", { p_symbol: symbol, p_timeframe: "1d" });
  const c = cached.data as Cached | null;
  if (c && c.current && c.algorithm_version === version && c.pivots) {
    const degrees = Object.fromEntries(DEGREES.map((d) => [d, fromCompact(c.pivots[d])])) as ClientPivots["degrees"];
    return { source: "cache", asOf: c.analysis_timestamp, bars: c.input_bars, pivots: { version, degrees } };
  }
  const { data } = await db().rpc("get_bars", { p_symbol: symbol, p_timeframe: "1d", p_limit: 600 });
  const bars = (data ?? []) as BarRow[];
  if (!bars.length) return null;
  return { source: "live", asOf: bars.at(-1)!.ts, bars: bars.length, pivots: pivotsForClient(bars, "1d") };
}
