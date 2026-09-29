import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/supabase";
import { CASH_SYMBOL, parseHoldings, type Context, type Holding } from "@/lib/portfolio/xray";
import { PROXY_SYMBOLS, buildWorkspace, type Benchmark } from "@/lib/portfolio/workspace";
import type { Close } from "@/lib/analysis/stats";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Rows = { symbol: string; closes: [string, number][] }[];
const toMap = (rows: Rows) => new Map(rows.map((r) => [r.symbol, r.closes.map(([ts, close]) => ({ ts, close }))]));

async function closesFor(symbols: string[]): Promise<Map<string, Close[]>> {
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 40) chunks.push(symbols.slice(i, i + 40));
  const res = await Promise.all(chunks.map((c) => db().rpc("portfolio_closes", { p_symbols: c, p_limit: 504 })));
  const bad = res.find((r) => r.error);
  if (bad) throw new Error(bad.error!.message);
  return new Map(res.flatMap((r) => [...toMap((r.data ?? []) as Rows)]));
}

// benchmark, factor and sector proxies are the same for every request: cached for an hour
const proxies = unstable_cache(async () => [...(await closesFor(PROXY_SYMBOLS))], ["xray-proxies-v1"], { revalidate: 3600 });

/**
 * Portfolio X-Ray workspace. Takes pasted holdings (and optionally a custom benchmark or a second
 * holdings list to compare with), looks up only those symbols' stored data, and returns every
 * figure on /portfolio. Holdings are not stored or logged.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { text?: unknown; targets?: unknown; custom?: unknown; compare?: { text?: unknown; label?: unknown } } | null;
  const text = typeof body?.text === "string" ? body.text.slice(0, 20_000) : "";
  const { holdings, errors } = parseHoldings(text);
  if (!holdings.length) return NextResponse.json({ errors: errors.length ? errors : ["No holdings found."] }, { status: 400 });
  const custom = sanitizeWeights(body?.custom);
  const cmpText = typeof body?.compare?.text === "string" ? body.compare.text.slice(0, 20_000) : "";
  const cmp = cmpText ? parseHoldings(cmpText).holdings : [];
  const cmpLabel = typeof body?.compare?.label === "string" ? body.compare.label.slice(0, 80) : "Saved portfolio";

  const sym = (hs: Holding[]) => hs.filter((h) => !h.cash).map((h) => h.symbol);
  const extra = [...new Set([...sym(holdings), ...sym(cmp), ...Object.keys(custom ?? {}).filter((s) => s !== CASH_SYMBOL)])].filter((s) => !PROXY_SYMBOLS.includes(s));
  try {
    const [ctxRes, zoneRes, proxy, own] = await Promise.all([
      db().rpc("portfolio_context", { p_symbols: [...new Set([...sym(holdings), ...sym(cmp), ...Object.keys(custom ?? {}), "SPY", "QQQ", "AGG"])].slice(0, 100) }),
      db().rpc("portfolio_structure", { p_symbols: sym(holdings) }),
      proxies(),
      extra.length ? closesFor(extra) : Promise.resolve(new Map<string, Close[]>()),
    ]);
    if (ctxRes.error) throw new Error(ctxRes.error.message);
    const ctx = (ctxRes.data ?? []) as Context[];
    const closes = new Map([...proxy, ...own]);
    const benchmarks: Benchmark[] = [];
    if (custom) benchmarks.push({ id: "custom", label: "Custom benchmark", weights: custom });
    if (cmp.length) {
      const px = new Map(ctx.map((c) => [c.symbol, c.close ?? 0]));
      const vals = cmp.map((h) => [h.symbol, h.cash ? h.shares : h.shares * (px.get(h.symbol) ?? 0)] as const).filter(([, v]) => v > 0);
      const tot = vals.reduce((a, [, v]) => a + v, 0);
      if (tot > 0) benchmarks.push({ id: "compare", label: cmpLabel, weights: Object.fromEntries(vals.map(([s, v]) => [s, v / tot])) });
    }
    const ws = buildWorkspace({
      holdings, ctx,
      zones: (zoneRes.data ?? []) as { symbol: string; zone_low: number | null; zone_high: number | null }[],
      closes, targets: sanitizeWeights(body?.targets), benchmarks,
    });
    return NextResponse.json({ errors, result: ws }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("workspace", (e as Error).message);
    return NextResponse.json({ errors: ["Market data couldn't be loaded. Try again in a moment."] }, { status: 502 });
  }
}

/** {SYMBOL: fraction} maps (targets, custom benchmark); anything else is dropped. */
function sanitizeWeights(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== "object") return null;
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 200)) {
    const s = k.trim().toUpperCase();
    if (/^[A-Z0-9.\-]{1,12}$/.test(s) && typeof x === "number" && isFinite(x) && x >= 0 && x <= 1) out[s] = x;
  }
  return Object.keys(out).length ? out : null;
}
