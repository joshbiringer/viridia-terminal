import { db } from "@/lib/supabase";
import type { SetupKind } from "./candidates";
import { BACKTEST_VERSION } from "@engine/backtest";

export interface KindRecord {
  kind: SetupKind; side: "buy" | "sell"; trials: number; resolved: number; targets: number; stops: number; expired: number;
  missed: number; pending: number; hit_rate: number | null; avg_r: number | null; median_bars: number | null;
}

export const TRACK_METHOD =
  "Each security's stored daily history is replayed: at every fifth session after the first 250, the engine runs on the bars up to that day only, and the setup it would have shown is followed for up to 60 sessions. The first of stop or target decides it (the stop when one bar touches both); otherwise it expires, marked to the close. Results are in R, multiples of the initial risk. Fills at the close or the entry edge, no costs or slippage, and only securities listed today (survivorship). Past results don't predict future ones.";

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
