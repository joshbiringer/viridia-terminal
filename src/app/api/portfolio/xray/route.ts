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
  const body = (await req.json().catch(() => null)) as { text?: string; targets?: unknown } | null;
  const targets = sanitizeTargets(body?.targets);
  const text = typeof body?.text === "string" ? body.text.slice(0, 20_000) : "";
  const { holdings, errors } = parseHoldings(text);
  if (!holdings.length) return NextResponse.json({ errors: errors.length ? errors : ["No holdings found."] }, { status: 400 });
  const symbols = [...holdings.map((h) => h.symbol), "SPY"];
  // closes in chunks of 8 symbols, in parallel, to stay inside the database's per-call time limit
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 8) chunks.push(symbols.slice(i, i + 8));
  const [ctxRes, ...closeRes] = await Promise.all([
    db().rpc("portfolio_context", { p_symbols: symbols }),
    ...chunks.map((c) => db().rpc("closes_for", { p_symbols: c, p_limit: 253 })),
  ]);
  const failed = ctxRes.error ?? closeRes.find((r) => r.error)?.error;
  if (failed) {
    console.error("xray", failed.message);
    return NextResponse.json({ errors: ["Market data couldn't be loaded. Try again in a moment."] }, { status: 502 });
  }
  const closes = new Map<string, Close[]>();
  for (const res of closeRes) {
    for (const r of (res.data ?? []) as { symbol: string; closes: [string, number][] }[]) {
      closes.set(r.symbol, r.closes.map(([ts, close]) => ({ ts, close })));
    }
  }
  const ctx = ((ctxRes.data ?? []) as Context[]).filter((c) => holdings.some((h) => h.symbol === c.symbol));
  return NextResponse.json({ errors, result: xray(holdings, ctx, closes, new Date(), targets) }, { headers: { "Cache-Control": "no-store" } });
}

/** Targets arrive as {SYMBOL: fraction}; anything else is dropped. */
function sanitizeTargets(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== "object") return null;
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 200)) {
    const sym = k.trim().toUpperCase();
    if (/^[A-Z0-9.\-]{1,12}$/.test(sym) && typeof x === "number" && isFinite(x) && x >= 0 && x <= 1) out[sym] = x;
  }
  return Object.keys(out).length ? out : null;
}
