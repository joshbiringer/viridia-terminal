import { unstable_cache } from "next/cache";
import { db } from "@/lib/supabase";
import { getBreadth, scan, type Breadth, type ScanRow } from "@/lib/market-data/snapshot";
import { getPulse } from "@/lib/market-data/pulse";
import { getEventCounts, getStructureEvents } from "./events-server";
import { CHANGE_GROUPS, type EventType, type StructureEvent } from "./events";
import { setupScan, type SetupRow } from "./setup-scan";
import { getTrackRecord, type KindRecord } from "./track-record";
import { PULSE_SYMBOLS, type PulseRow } from "./mission";

export const LIQUID = 25_000_000; // $25M average daily dollar volume
const DV = `dv=${LIQUID}`;

export type SignalId = "strong" | "wave3" | "fib" | "near_invalidation" | "abc_done" | "strength52";
export const SIGNAL_CARDS: { id: SignalId; label: string; hint: string; href: string }[] = [
  { id: "strong", label: "Strong structure", hint: "Preferred daily count with Pattern Confidence 70+", href: `/scanner?score=70&${DV}&sort=confidence` },
  { id: "wave3", label: "Wave 3", hint: "Preferred count is an impulse or diagonal in its third wave", href: `/scanner?s=wave3&${DV}&sort=confidence` },
  { id: "fib", label: "Fib confluence", hint: "Within 3% of a Fibonacci confluence zone", href: `/scanner?s=near_zone&${DV}&sort=zone` },
  { id: "near_invalidation", label: "Near invalidation", hint: "Within 3% of the level that breaks the preferred count", href: `/scanner?s=near_invalidation&${DV}&sort=invalidation` },
  { id: "abc_done", label: "Correction complete", hint: "A zigzag or flat looks complete", href: `/scanner?s=abc_done&${DV}&sort=confidence` },
  { id: "strength52", label: "52W strength", hint: "Within 3% of the 52-week high", href: `/scanner?near=high&${DV}&sort=from_high` },
];
export interface SignalCount { signal: SignalId; day: string | null; prior_day: string | null; n_today: number; n_prior: number | null; new_today: number | null }

export interface FibRow { symbol: string; name: string; close: number; low: number; high: number; mid: number; strength: number; relationships: number; degrees: string[]; side: string; distance_pct: number; adv20: number | null }
export interface AlignRow { symbol: string; name: string; close: number | null; change_pct: number | null; dir: string; d_pattern: string | null; d_complete: boolean | null; d_wave: string | null; d_score: number | null; w_pattern: string | null; w_complete: boolean | null; w_wave: string | null; w_score: number | null; total: number }
export interface SignalsData { wave: ScanRow[]; fib: FibRow[]; invalidation: ScanRow[]; aligned: AlignRow[] }

export interface MarketContext {
  pulse: PulseRow[]; breadth: Breadth | null; events: StructureEvent[]; eventCounts: { day: string; type: EventType; n: number }[]; gainer: ScanRow | null; loser: ScanRow | null;
  setups: SetupRow[]; record: KindRecord[]; active: ScanRow[]; popular: PulseRow[]; signalCounts: SignalCount[]; signals: SignalsData;
  /** A few of the heaviest liquid events of each What Changed group, so every group has examples. */
  changeEvents: StructureEvent[];
}

const EMPTY: MarketContext = { pulse: [], breadth: null, events: [], eventCounts: [], gainer: null, loser: null, setups: [], record: [], active: [], popular: [], signalCounts: [], signals: { wave: [], fib: [], invalidation: [], aligned: [] }, changeEvents: [] };

/**
 * Everything on Mission Control that is the same for every reader. Prices are end of day, so it is
 * cached for five minutes: one page view no longer means a dozen database queries. A failed load
 * throws inside the cache so it is never stored.
 */
const load = unstable_cache(async (): Promise<MarketContext> => {
  const [pulse, breadth, events, eventCounts, gainers, losers, setups, record, active, signalCounts] = await Promise.all([
    getPulse(PULSE_SYMBOLS),
    getBreadth(),
    getStructureEvents({ minDollarVolume: LIQUID, days: 1, limit: 120 }).catch(() => []),
    getEventCounts(LIQUID).catch(() => []),
    scan({ p_sort: "change", p_limit: 1, p_min_dollar_volume: LIQUID }).catch(() => []),
    scan({ p_sort: "change_asc", p_limit: 1, p_min_dollar_volume: LIQUID }).catch(() => []),
    setupScan({ p_sort: "quality", p_limit: 6, p_min_rr: 1.5, p_min_dollar_volume: LIQUID, p_exclude_negative: true, p_max_risk: 0.2 }).catch(() => []),
    getTrackRecord().catch(() => []),
    scan({ p_sort: "dollar_volume", p_limit: 8 }).catch(() => []),
    db().rpc("signal_counts", { p_min_dollar_volume: LIQUID }).then((r) => ((r.data ?? []) as SignalCount[]).map((x) => ({
      ...x, n_today: Number(x.n_today), n_prior: x.n_prior == null ? null : Number(x.n_prior), new_today: x.new_today == null ? null : Number(x.new_today),
    })), () => [] as SignalCount[]),
  ]);
  if (!pulse.length) throw new Error("market pulse unavailable");
  const [popular, wave, fib, invalidation, aligned, ...grouped] = await Promise.all([
    getPulse(active.map((r) => r.symbol)).catch(() => []),
    scan({ p_structure: "wave3", p_sort: "confidence", p_limit: 10, p_min_dollar_volume: LIQUID }).catch(() => []),
    db().rpc("fib_zone_scan", { p_max_distance: 0.03, p_min_count: 3, p_min_dollar_volume: LIQUID, p_limit: 10 }).then((r) => (r.data ?? []) as FibRow[], () => []),
    scan({ p_structure: "near_invalidation", p_sort: "confidence", p_limit: 10, p_min_dollar_volume: LIQUID }).catch(() => []),
    db().rpc("timeframe_alignment", { p_min_dollar_volume: LIQUID, p_limit: 10 }).then((r) => ((r.data ?? []) as AlignRow[]).map((x) => ({ ...x, total: Number(x.total) })), () => []),
    ...CHANGE_GROUPS.map((g) => getStructureEvents({ types: g.types, minDollarVolume: LIQUID, days: 1, limit: 4 }).catch(() => [] as StructureEvent[])),
  ]);
  return {
    pulse, breadth, events, eventCounts, gainer: gainers[0] ?? null, loser: losers[0] ?? null, setups, record, active, popular,
    signalCounts, signals: { wave, fib, invalidation, aligned }, changeEvents: (grouped as StructureEvent[][]).flat(),
  };
}, ["mission-market-v7"], { revalidate: 300 });

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
