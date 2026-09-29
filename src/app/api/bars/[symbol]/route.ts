import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase";
import { pivotsForClient } from "@/lib/analysis/pivots";
import { TIMEFRAMES, isChartTimeframe, nativeFor, validBar, type BarRow, type BarsResponse, type HistoryStatus } from "@/lib/market-data/bars";

export const maxDuration = 20;

/** Resolve within ms or give null, so a slow side call can't hold up the chart. */
function within<T>(p: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([Promise.resolve(p), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/**
 * Bars for one symbol and chart timeframe. If the stored history behind that timeframe is missing
 * or incomplete, this also queues a fetch (request_price_history) and reports the queue status,
 * so the client can show progress and poll. It also returns adaptive pivots for the same bars.
 * Malformed bars are dropped (and counted in meta) rather than drawn.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase().slice(0, 24);
  const tf = req.nextUrl.searchParams.get("tf") ?? "1d";
  if (!isChartTimeframe(tf)) return NextResponse.json({ error: "Unsupported timeframe." }, { status: 400 });
  if (!/^[A-Z0-9.:\-/]{1,24}$/.test(symbol)) return NextResponse.json({ error: "Not a ticker." }, { status: 400 });
  const limit = TIMEFRAMES.find((t) => t.id === tf)!.limit;
  const started = Date.now();

  try {
    const sb = db();
    const [hist, bars] = await Promise.all([
      within(sb.rpc("request_price_history", { p_symbol: symbol, p_timeframe: nativeFor(tf) }), 4_000),
      within(sb.rpc("get_bars", { p_symbol: symbol, p_timeframe: tf, p_limit: limit }), 12_000),
    ]);
    if (!bars) throw new Error("get_bars timed out");
    if (bars.error) throw new Error(`get_bars: ${bars.error.message}`);
    const all = ((bars.data ?? []) as BarRow[]).map((b) => ({ ...b, volume: Number(b.volume) || 0 }));
    const rows = all.filter(validBar);
    if (rows.length < all.length) console.warn(JSON.stringify({ at: "api/bars", symbol, tf, dropped: all.length - rows.length }));
    const queue = hist && !hist.error ? (hist.data as HistoryStatus | null) : null;
    const body: BarsResponse = {
      symbol, timeframe: tf,
      history: queue ?? (hist?.error ? { status: "error" } : null),
      bars: rows,
      // Pivots are computed from exactly these bars with the shared engine (same code as the cache worker).
      pivots: rows.length ? pivotsForClient(rows, tf) : null,
      meta: { source: "Massive (end of day, split-adjusted)", served_at: new Date().toISOString(), last_bar: rows.at(-1)?.ts ?? null, dropped: all.length - rows.length },
    };
    // a queued history fetch must not be cached; otherwise a short shared cache spares the database
    const cache = queue?.status === "queued" ? "no-store" : "public, s-maxage=120, stale-while-revalidate=900";
    return NextResponse.json(body, { headers: { "Cache-Control": cache } });
  } catch (e) {
    console.error(JSON.stringify({ at: "api/bars", symbol, tf, ms: Date.now() - started, error: (e as Error).message }));
    return NextResponse.json({ error: "Price data is unavailable right now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
