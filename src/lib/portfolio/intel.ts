/**
 * Portfolio Intelligence (Mission Control rail): a saved portfolio measured with stored end-of-day
 * data. Pure; the page supplies the holdings, each symbol's context and its latest structural events.
 * Only what the data supports: value and the day's move need a close and a prior close for every
 * priced holding; nothing is estimated for holdings without prices.
 */
import type { Context, Holding } from "./xray";
import type { StructureEvent } from "@/lib/analysis/events";

export interface PortfolioIntel {
  holdings: number; priced: number; value: number; dayMove: number | null; dayPct: number | null;
  largest: { symbol: string; weight: number } | null;
  contributor: { symbol: string; amount: number } | null;
  detractor: { symbol: string; amount: number } | null;
  structural: { symbol: string; type: StructureEvent["type"]; detail: Record<string, unknown> }[];
  nearInvalidation: string[];
  fibEvents: string[];
}

const NEAR = 0.03; // within 3% of the preferred count's invalidation level, as in the scanner

export function portfolioIntel(holdings: Holding[], ctx: Context[], events: StructureEvent[]): PortfolioIntel {
  const by = new Map(ctx.map((c) => [c.symbol, c]));
  const rows = holdings.map((h) => {
    const c = by.get(h.symbol);
    const close = c?.close ?? null, prev = c?.prev_close ?? null;
    return { symbol: h.symbol, value: close != null ? h.shares * close : null, move: close != null && prev != null && prev > 0 ? h.shares * (close - prev) : null, c };
  });
  const priced = rows.filter((r) => r.value != null);
  const value = priced.reduce((a, r) => a + r.value!, 0);
  const moved = priced.filter((r) => r.move != null);
  const dayMove = moved.length === priced.length && priced.length ? moved.reduce((a, r) => a + r.move!, 0) : null;
  const prior = dayMove != null ? value - dayMove : null;
  const top = [...priced].sort((a, b) => b.value! - a.value!)[0];
  const byMove = [...moved].sort((a, b) => b.move! - a.move!);
  const up = byMove[0], down = byMove[byMove.length - 1];
  const mine = new Set(holdings.map((h) => h.symbol));
  const evs = events.filter((e) => mine.has(e.symbol));
  const seen = new Set<string>();
  return {
    holdings: holdings.length, priced: priced.length, value,
    dayMove, dayPct: dayMove != null && prior && prior > 0 ? dayMove / prior : null,
    largest: top && value > 0 ? { symbol: top.symbol, weight: top.value! / value } : null,
    contributor: up && up.move! > 0 ? { symbol: up.symbol, amount: up.move! } : null,
    detractor: down && down.move! < 0 ? { symbol: down.symbol, amount: down.move! } : null,
    structural: [...evs].sort((a, b) => b.weight - a.weight)
      .filter((e) => !e.type.startsWith("FIB_") && (seen.has(e.symbol) ? false : (seen.add(e.symbol), true)))
      .map((e) => ({ symbol: e.symbol, type: e.type, detail: e.detail })),
    nearInvalidation: rows.filter((r) => r.c?.glance_hold && r.c.close && Math.abs(r.c.glance_hold / r.c.close - 1) <= NEAR).map((r) => r.symbol),
    fibEvents: [...new Set(evs.filter((e) => e.type === "FIB_ZONE_ENTERED" || e.type === "FIB_ZONE_CREATED").map((e) => e.symbol))],
  };
}
