/**
 * Ask Viridia's data tools. Each one reads a small, specific slice of Viridia's stored data; nothing
 * sends the database to a model. The engine receives these through the Tools interface so tests can
 * substitute fixtures.
 */
import { db } from "@/lib/supabase";
import { authClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth";
import { getMarketContext, type MarketContext } from "@/lib/analysis/mission-server";
import { getStructureEvents } from "@/lib/analysis/events-server";
import type { StructureEvent } from "@/lib/analysis/events";
import type { SecurityPreview } from "@/lib/analysis/mission";
import { scan, type ScanRow } from "@/lib/market-data/snapshot";
import { parseHoldings, type Context } from "@/lib/portfolio/xray";
import { PROXY_SYMBOLS, buildWorkspace, type Workspace } from "@/lib/portfolio/workspace";
import type { Close } from "@/lib/analysis/stats";
import type { WatchRow } from "@/lib/analysis/mission-page";

export interface AskZone { low: number; high: number; mid: number; side: "above" | "below"; count: number; strength: number; distancePct: number; degrees: string[]; levels: { label: string; price: number; degree: string; kind: string }[] }
export interface AskStructure {
  swing: Partial<Record<"primary" | "intermediate" | "minor", string>> | null;
  candidates: number | null; analysis_ts: string | null; close_call: boolean | null; zones: AskZone[];
}

export interface Tools {
  resolveSymbols(tokens: string[]): Promise<{ symbol: string; name: string; asset_subtype: string | null }[]>;
  security(symbol: string): Promise<SecurityPreview | null>;
  structure(symbol: string): Promise<AskStructure | null>;
  events(symbols: string[] | null, days: number, limit?: number): Promise<StructureEvent[]>;
  market(): Promise<MarketContext | null>;
  scan(params: Record<string, unknown>): Promise<ScanRow[]>;
  watchlist(): Promise<WatchRow[] | null>;
  portfolio(id?: string | null): Promise<{ id: string; name: string; ws: Workspace } | null>;
}

export const serverTools: Tools = {
  async resolveSymbols(tokens) {
    if (!tokens.length) return [];
    const { data, error } = await db().rpc("resolve_symbols", { p_symbols: tokens });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { symbol: string; name: string; asset_subtype: string | null }[];
    return tokens.map((t) => rows.find((r) => r.symbol === t)).filter((r): r is NonNullable<typeof r> => !!r);
  },
  async security(symbol) {
    const { data, error } = await db().rpc("security_preview", { p_symbol: symbol });
    if (error) throw new Error(error.message);
    return (data ?? null) as SecurityPreview | null;
  },
  async structure(symbol) {
    const { data, error } = await db().rpc("ask_structure", { p_symbol: symbol });
    if (error) throw new Error(error.message);
    return (data ?? null) as AskStructure | null;
  },
  async events(symbols, days, limit = 40) {
    return getStructureEvents({ symbols, days, limit });
  },
  async market() {
    const { ctx, ok } = await getMarketContext();
    return ok ? ctx : null;
  },
  async scan(params) {
    return scan(params);
  },
  async watchlist() {
    const viewer = await getViewer().catch(() => null);
    if (!viewer) return null;
    const { data } = await (await authClient()).rpc("my_watchlist");
    return (data ?? []) as WatchRow[];
  },
  async portfolio(id) {
    const viewer = await getViewer().catch(() => null);
    if (!viewer) return null;
    const sb = await authClient();
    const q = sb.from("portfolios").select("id, name, holdings_text, targets").order("updated_at", { ascending: false }).limit(1);
    const { data } = id ? await sb.from("portfolios").select("id, name, holdings_text, targets").eq("id", id).limit(1) : await q;
    const p = (data ?? [])[0] as { id: string; name: string; holdings_text: string; targets: Record<string, number> } | undefined;
    if (!p) return null;
    const { holdings } = parseHoldings(p.holdings_text);
    const syms = holdings.filter((h) => !h.cash).map((h) => h.symbol);
    const all = [...new Set([...syms, ...PROXY_SYMBOLS])];
    const [ctxRes, zoneRes, closeRes] = await Promise.all([
      db().rpc("portfolio_context", { p_symbols: [...new Set([...syms, "SPY", "QQQ", "AGG"])].slice(0, 100) }),
      db().rpc("portfolio_structure", { p_symbols: syms }),
      Promise.all(chunk(all, 40).map((c) => db().rpc("portfolio_closes", { p_symbols: c, p_limit: 504 }))),
    ]);
    const closes = new Map<string, Close[]>();
    for (const r of closeRes) for (const row of (r.data ?? []) as { symbol: string; closes: [string, number][] }[]) closes.set(row.symbol, row.closes.map(([ts, close]) => ({ ts, close })));
    const ws = buildWorkspace({
      holdings, ctx: (ctxRes.data ?? []) as Context[], closes, targets: p.targets,
      zones: (zoneRes.data ?? []) as { symbol: string; zone_low: number | null; zone_high: number | null }[],
    });
    return { id: p.id, name: p.name, ws };
  },
};

function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}
