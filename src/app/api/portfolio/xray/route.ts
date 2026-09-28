import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { parseHoldings, xray, type Context } from "@/lib/portfolio/xray";
import type { Close } from "@/lib/analysis/stats";

export const dynamic = "force-dynamic";

/**
 * Portfolio X-Ray. Takes the pasted holdings, looks up only their symbols' market data, and returns
 * the measurements. The holdings are not stored or logged anywhere.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { text?: string } | null;
  const text = typeof body?.text === "string" ? body.text.slice(0, 20_000) : "";
  const { holdings, errors } = parseHoldings(text);
  if (!holdings.length) return NextResponse.json({ errors: errors.length ? errors : ["No holdings found."] }, { status: 400 });
  const symbols = [...holdings.map((h) => h.symbol), "SPY"];
  const [ctxRes, closesRes] = await Promise.all([
    db().rpc("portfolio_context", { p_symbols: symbols }),
    db().rpc("closes_for", { p_symbols: symbols, p_limit: 253 }),
  ]);
  if (ctxRes.error || closesRes.error) {
    console.error("xray", ctxRes.error?.message, closesRes.error?.message);
    return NextResponse.json({ errors: ["Market data couldn't be loaded. Try again in a moment."], detail: (ctxRes.error ?? closesRes.error)?.message }, { status: 502 });
  }
  const closes = new Map<string, Close[]>();
  for (const r of (closesRes.data ?? []) as { symbol: string; ts: string; close: number }[]) {
    if (!closes.has(r.symbol)) closes.set(r.symbol, []);
    closes.get(r.symbol)!.push({ ts: r.ts, close: r.close });
  }
  for (const v of closes.values()) v.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  const ctx = ((ctxRes.data ?? []) as Context[]).filter((c) => holdings.some((h) => h.symbol === c.symbol));
  return NextResponse.json({ errors, result: xray(holdings, ctx, closes) }, { headers: { "Cache-Control": "no-store" } });
}
