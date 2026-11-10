import { db } from "@/lib/supabase";
import type { SetupKind } from "./candidates";
import { BACKTEST_VERSION } from "@engine/backtest";

export interface KindRecord {
  kind: SetupKind; side: "buy" | "sell"; trials: number; resolved: number; targets: number; stops: number; expired: number;
  missed: number; pending: number; hit_rate: number | null; avg_r: number | null; median_bars: number | null;
}

export const TRACK_METHOD =
  "Hypothetical replay, not trading results. Each security's stored daily history is replayed: at every fifth session after the first 250, the engine runs on the bars up to that day only, and the setup it would have shown is followed for up to 60 sessions. The first of stop or target decides it (the stop when one bar touches both); otherwise it expires, marked to the close. Results are in R, multiples of the initial risk. Fills at the close or the entry edge, no costs or slippage, and only securities listed today (survivorship). Past results don't predict future ones.";

/** Track record by setup kind and side, optionally for a minimum confidence and reward:risk. */
export async function getTrackRecord(minScore?: number | null, minRr?: number | null): Promise<KindRecord[]> {
  const { data } = await db().rpc("backtest_stats", { p_min_score: minScore ?? null, p_min_rr: minRr ?? null });
  return ((data ?? []) as KindRecord[]).map((r) => ({
    ...r, trials: Number(r.trials), resolved: Number(r.resolved), targets: Number(r.targets), stops: Number(r.stops),
    expired: Number(r.expired), missed: Number(r.missed), pending: Number(r.pending),
  }));
}

export interface SymbolTrial {
  ts: string; degree: string; kind: SetupKind; side: "buy" | "sell"; status: string; score: number | null; rr: number;
  entry: number; stop: number; target: number; outcome: "target" | "stop" | "expired" | "missed" | "pending"; r: number | null; bars: number;
}
export async function getSymbolTrials(symbol: string, limit = 40): Promise<SymbolTrial[]> {
  const { data } = await db().rpc("backtest_symbol", { p_symbol: symbol, p_limit: limit });
  return (data ?? []) as SymbolTrial[];
}

export async function getBacktestCoverage(): Promise<{ done: number; total: number; trials: number } | null> {
  const { data } = await db().rpc("backtest_coverage", { p_version: BACKTEST_VERSION });
  return (data ?? null) as { done: number; total: number; trials: number } | null;
}

export interface KindQuality {
  kind: SetupKind; side: "buy" | "sell"; n: number; avg_r: number | null; hit_rate: number | null;
  split_date: string | null; n_early: number; r_early: number | null; n_late: number; r_late: number | null;
  grade: "positive" | "mixed" | "negative" | "thin"; updated_at: string;
}
export async function getSetupQuality(): Promise<KindQuality[]> {
  const { data } = await db().rpc("setup_quality");
  return (data ?? []) as KindQuality[];
}

export interface BacktestFreshness { last_run: string | null; first_signal: string | null; last_signal: string | null; securities: number; job_active: boolean }
/** When the replay last ran and the window its signals cover; null until migration 0044 is applied. */
export async function getBacktestFreshness(): Promise<BacktestFreshness | null> {
  const { data, error } = await db().rpc("backtest_freshness");
  if (error) return null;
  return (data ?? null) as BacktestFreshness | null;
}

export interface ScoreBucket { bucket: number; side: "buy" | "sell"; trials: number; resolved: number; targets: number; positive: number; avg_r: number | null }
/** Outcomes by Pattern Confidence bucket (40 = under 50, then 50s, 60s, 70s, 80s, 90+) and side; null until 0044. */
export async function getScoreBuckets(minRr?: number | null): Promise<ScoreBucket[] | null> {
  const { data, error } = await db().rpc("backtest_score_buckets", { p_min_rr: minRr ?? null });
  if (error) return null;
  return ((data ?? []) as ScoreBucket[]).map((b) => ({ ...b, trials: Number(b.trials), resolved: Number(b.resolved), targets: Number(b.targets), positive: Number(b.positive) }));
}

/** Combine bucket rows (both sides, or one) into one line per bucket. */
export function bucketTotals(rows: ScoreBucket[], side?: "buy" | "sell") {
  const by = new Map<number, { bucket: number; trials: number; resolved: number; targets: number; positive: number; rSum: number }>();
  for (const r of rows) {
    if (side && r.side !== side) continue;
    const b = by.get(r.bucket) ?? { bucket: r.bucket, trials: 0, resolved: 0, targets: 0, positive: 0, rSum: 0 };
    b.trials += r.trials; b.resolved += r.resolved; b.targets += r.targets; b.positive += r.positive; b.rSum += (r.avg_r ?? 0) * r.resolved;
    by.set(r.bucket, b);
  }
  return [...by.values()].sort((a, b) => b.bucket - a.bucket).map((b) => ({ ...b, avgR: b.resolved ? b.rSum / b.resolved : null }));
}

/** Days since a timestamp, for staleness notes. */
export const daysSince = (iso: string | null, now = Date.now()) => (iso ? Math.floor((now - Date.parse(iso)) / 86_400_000) : null);
