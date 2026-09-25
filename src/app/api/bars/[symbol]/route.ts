import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase";
import { pivotsForClient } from "@/lib/analysis/pivots";
import { TIMEFRAMES, isChartTimeframe, nativeFor, type BarRow, type BarsResponse, type HistoryStatus } from "@/lib/market-data/bars";

/**
 * Bars for one symbol and chart timeframe. If the stored history behind that timeframe is missing
 * or incomplete, this also queues a fetch (request_price_history) and reports the queue status,
 * so the client can show progress and poll. It also returns adaptive pivots for the same bars.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase().slice(0, 24);
  const tf = req.nextUrl.searchParams.get("tf") ?? "1d";
  if (!isChartTimeframe(tf)) return NextResponse.json({ error: "Unsupported timeframe" }, { status: 400 });
  const limit = TIMEFRAMES.find((t) => t.id === tf)!.limit;

  try {
    const sb = db();
    const [hist, bars] = await Promise.all([
      sb.rpc("request_price_history", { p_symbol: symbol, p_timeframe: nativeFor(tf) }),
      sb.rpc("get_bars", { p_symbol: symbol, p_timeframe: tf, p_limit: limit }),
    ]);
    if (bars.error) throw bars.error;
    const rows = ((bars.data ?? []) as BarRow[]).map((b) => ({ ...b, volume: Number(b.volume) }));
    const body: BarsResponse = {
      symbol, timeframe: tf,
      history: (hist.data as HistoryStatus | null) ?? (hist.error ? { status: "error" } : null),
      bars: rows,
      // Pivots are computed from exactly these bars with the shared engine (same code as the cache worker).
      pivots: rows.length ? pivotsForClient(rows, tf) : null,
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Price data is unavailable right now." }, { status: 502 });
  }
}
