import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { ANALYSIS_VERSION, computeAnalysis } from "@engine/analyze";
import type { PivotBar } from "@engine/pivots";

export const dynamic = "force-dynamic";

/**
 * Engine parity check. The analysis-worker (Deno, Supabase) and this app (Node, Vercel) run the same
 * engine files; this recomputes one symbol here from the same stored bars and reports whether the
 * cached result matches exactly. A mismatch means the deployed worker has drifted from the repo.
 * Returns booleans and versions only.
 */
export async function GET(req: Request) {
  const symbol = (new URL(req.url).searchParams.get("symbol") ?? "SPY").toUpperCase().slice(0, 12);
  const [cachedRes, barsRes] = await Promise.all([
    db().rpc("get_analysis", { p_symbol: symbol, p_timeframe: "1d" }),
    db().rpc("get_bars", { p_symbol: symbol, p_timeframe: "1d", p_limit: 600 }),
  ]);
  const cached = cachedRes.data as {
    algorithm_version: string; current: boolean; candidates: unknown; zones: unknown; analysis_timestamp: string;
  } | null;
  if (!cached) return NextResponse.json({ symbol, error: "no cached analysis" }, { status: 404 });
  const bars = (barsRes.data ?? []) as PivotBar[];
  const live = computeAnalysis(bars, "1d");
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const comparable = cached.algorithm_version === ANALYSIS_VERSION && cached.current;
  return NextResponse.json({
    symbol,
    app_version: ANALYSIS_VERSION,
    cache_version: cached.algorithm_version,
    cache_current: cached.current,
    analysis_timestamp: cached.analysis_timestamp,
    // only meaningful when the cache was built by this engine version from the same bars
    match: comparable ? {
      candidates: same(live.candidate_counts_json, cached.candidates),
      zones: same(live.confluence_zones_json, cached.zones),
    } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}
