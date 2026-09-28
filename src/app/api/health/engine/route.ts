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
  // jsonb reorders object keys, so compare structurally and report the first differing path
  const diff = (a: unknown, b: unknown, path = "$"): string | null => {
    if (typeof a === "number" && typeof b === "number") return a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a)) ? null : path;
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return a === b ? null : path;
    if (Array.isArray(a) !== Array.isArray(b)) return path;
    const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
    const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
    if (ka.length !== kb.length) return `${path} (keys ${ka.length} vs ${kb.length})`;
    for (const k of ka) {
      const d = diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
      if (d) return d;
    }
    return null;
  };
  const cmp = (a: unknown, b: unknown) => { const d = diff(a, b); return d ? { equal: false, first_difference: d } : { equal: true }; };
  const comparable = cached.algorithm_version === ANALYSIS_VERSION && cached.current;
  return NextResponse.json({
    symbol,
    app_version: ANALYSIS_VERSION,
    cache_version: cached.algorithm_version,
    cache_current: cached.current,
    analysis_timestamp: cached.analysis_timestamp,
    // only meaningful when the cache was built by this engine version from the same bars
    match: comparable ? {
      candidates: cmp(live.candidate_counts_json, cached.candidates),
      zones: cmp(live.confluence_zones_json, cached.zones),
    } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}
