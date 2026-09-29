import { unstable_cache } from "next/cache";
import { db } from "@/lib/supabase";
import { getBreadth, scan, type Breadth, type ScanRow } from "@/lib/market-data/snapshot";
import { getPulse } from "@/lib/market-data/pulse";
import { getEventCounts, getStructureEvents } from "./events-server";
import type { EventType, StructureEvent } from "./events";
import { setupScan, type SetupRow } from "./setup-scan";
import { getTrackRecord, type KindRecord } from "./track-record";
import { PULSE_SYMBOLS, type PulseRow } from "./mission";

export const LIQUID = 25_000_000; // $25M average daily dollar volume
const DV = `dv=${LIQUID}`;

export const TILES: { label: string; hint: string; href: string; params: Record<string, unknown> }[] = [
  { label: "Strong structure", hint: "Preferred daily count with Pattern Confidence 70+", href: `/scanner?score=70&${DV}&sort=confidence`, params: { p_min_score: 70 } },
  { label: "Near a Fib zone", hint: "Within 3% of a Fibonacci confluence zone", href: `/scanner?s=near_zone&${DV}`, params: { p_structure: "near_zone" } },
  { label: "Near 52-week high", hint: "Trading near the 52-week high", href: `/scanner?near=high&${DV}`, params: { p_near: "high" } },
  { label: "Wave 3 in progress", hint: "Preferred count is in wave 3", href: `/scanner?s=wave3&${DV}`, params: { p_structure: "wave3" } },
  { label: "Correction complete", hint: "An A-B-C correction has completed", href: `/scanner?s=abc_done&${DV}`, params: { p_structure: "abc_done" } },
  { label: "Near invalidation", hint: "Within 3% of the level that breaks the preferred count", href: `/scanner?s=near_invalidation&${DV}`, params: { p_structure: "near_invalidation" } },
];

export interface FibRow { symbol: string; name: string; close: number; low: number; high: number; mid: number; strength: number; relationships: number; degrees: string[]; side: string; distance_pct: number; adv20: number | null }
export interface AlignRow { symbol: string; name: string; close: number | null; change_pct: number | null; dir: string; d_pattern: string | null; d_complete: boolean | null; d_wave: string | null; d_score: number | null; w_pattern: string | null; w_complete: boolean | null; w_wave: string | null; w_score: number | null; total: number }
export interface SignalsData { wave: ScanRow[]; fib: FibRow[]; invalidation: ScanRow[]; aligned: AlignRow[] }

export interface MarketContext {
  pulse: PulseRow[]; breadth: Breadth | null; events: StructureEvent[]; eventCounts: { day: string; type: EventType; n: number }[]; gainer: ScanRow | null; loser: ScanRow | null;
  setups: SetupRow[]; record: KindRecord[]; active: ScanRow[]; popular: PulseRow[]; tileCounts: (number | null)[]; signals: SignalsData;
}

const EMPTY: MarketContext = { pulse: [], breadth: null, events: [], eventCounts: [], gainer: null, loser: null, setups: [], record: [], active: [], popular: [], tileCounts: TILES.map(() => null), signals: { wave: [], fib: [], invalidation: [], aligned: [] } };

/**
 * Everything on Mission Control that is the same for every reader. Prices are end of day, so it is
 * cached for five minutes: one page view no longer means a dozen database queries. A failed load
 * throws inside the cache so it is never stored.
 */
const load = unstable_cache(async (): Promise<MarketContext> => {
  const [pulse, breadth, events, eventCounts, gainers, losers, setups, record, active, ...tiles] = await Promise.all([
    getPulse(PULSE_SYMBOLS),
    getBreadth(),
    getStructureEvents({ minDollarVolume: LIQUID, days: 1, limit: 120 }).catch(() => []),
    getEventCounts(LIQUID).catch(() => []),
    scan({ p_sort: "change", p_limit: 1, p_min_dollar_volume: LIQUID }).catch(() => []),
    scan({ p_sort: "change_asc", p_limit: 1, p_min_dollar_volume: LIQUID }).catch(() => []),
    setupScan({ p_sort: "quality", p_limit: 6, p_min_rr: 1.5, p_min_dollar_volume: LIQUID, p_exclude_negative: true }).catch(() => []),
    getTrackRecord().catch(() => []),
    scan({ p_sort: "dollar_volume", p_limit: 8 }).catch(() => []),
    ...TILES.map((t) => scan({ ...t.params, p_limit: 1, p_min_dollar_volume: LIQUID }).then((r) => r[0]?.total ?? 0).catch(() => null)),
  ]);
  if (!pulse.length) throw new Error("market pulse unavailable");
  const [popular, wave, fib, invalidation, aligned] = await Promise.all([
    getPulse(active.map((r) => r.symbol)).catch(() => []),
    scan({ p_structure: "wave3", p_sort: "confidence", p_limit: 10, p_min_dollar_volume: LIQUID }).catch(() => []),
    db().rpc("fib_zone_scan", { p_max_distance: 0.03, p_min_count: 3, p_min_dollar_volume: LIQUID, p_limit: 10 }).then((r) => (r.data ?? []) as FibRow[], () => []),
    scan({ p_structure: "near_invalidation", p_sort: "confidence", p_limit: 10, p_min_dollar_volume: LIQUID }).catch(() => []),
    db().rpc("timeframe_alignment", { p_min_dollar_volume: LIQUID, p_limit: 10 }).then((r) => ((r.data ?? []) as AlignRow[]).map((x) => ({ ...x, total: Number(x.total) })), () => []),
  ]);
  return {
    pulse, breadth, events, eventCounts, gainer: gainers[0] ?? null, loser: losers[0] ?? null, setups, record, active, popular,
    tileCounts: tiles, signals: { wave, fib, invalidation, aligned },
  };
}, ["mission-market-v4"], { revalidate: 300 });

// last good context held by this server instance, shown (with its own as-of date) if a reload fails
let lastGood: MarketContext | null = null;

export async function getMarketContext(): Promise<{ ctx: MarketContext; ok: boolean }> {
  try {
    lastGood = await load();
    return { ctx: lastGood, ok: true };
  } catch {
    return lastGood ? { ctx: lastGood, ok: true } : { ctx: EMPTY, ok: false };
  }
}
