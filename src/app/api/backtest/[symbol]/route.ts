import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { BACKTEST_VERSION, backtest } from "@engine/backtest";
import type { PivotBar } from "@engine/pivots";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Setup track record for one security: the engine replayed over its stored daily bars with no
 * look-ahead (engine backtest.ts). Postgres calls this through pg_net (backtest_tick) and stores the
 * trials; it is a pure computation over public market data, so it needs no credentials.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase().slice(0, 12);
  const { data, error } = await db().rpc("get_bars", { p_symbol: symbol, p_timeframe: "1d", p_limit: 600 });
  if (error) return NextResponse.json({ symbol, error: error.message }, { status: 502 });
  const bars = (data ?? []) as PivotBar[];
  if (bars.length < 260) return NextResponse.json({ symbol, version: BACKTEST_VERSION, bars: bars.length, source_last_ts: bars.at(-1)?.ts ?? null, trials: [] });
  const trials = backtest(bars, "1d");
  return NextResponse.json(
    { symbol, version: BACKTEST_VERSION, bars: bars.length, source_last_ts: bars.at(-1)!.ts, trials },
    { headers: { "Cache-Control": "public, s-maxage=3600" } },
  );
}
