import { db } from "@/lib/supabase";
import type { EventType, StructureEvent } from "./events";

export async function getStructureEvents(p: { symbols?: string[] | null; types?: EventType[] | null; minDollarVolume?: number | null; days?: number; limit?: number } = {}): Promise<StructureEvent[]> {
  const { data, error } = await db().rpc("recent_structure_events", {
    p_symbols: p.symbols ?? null, p_types: p.types ?? null, p_min_dollar_volume: p.minDollarVolume ?? null, p_days: p.days ?? 1, p_limit: p.limit ?? 50,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as StructureEvent[];
}

export async function getEventCounts(minDollarVolume?: number | null): Promise<{ day: string; type: EventType; n: number }[]> {
  const { data, error } = await db().rpc("structure_event_counts", { p_min_dollar_volume: minDollarVolume ?? null });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { day: string; type: EventType; n: number }[]).map((r) => ({ ...r, n: Number(r.n) }));
}

/** The single most meaningful event per security, in order. */
export function bestPerSymbol(events: StructureEvent[]): StructureEvent[] {
  const seen = new Set<string>();
  return [...events].sort((a, b) => b.weight - a.weight || (b.adv20 ?? 0) - (a.adv20 ?? 0)).filter((e) => (seen.has(e.symbol) ? false : (seen.add(e.symbol), true)));
}
