import { db } from "@/lib/supabase";
import type { Setup, SetupKind } from "./candidates";
import type { Grade } from "./quality";

export interface SetupRow {
  symbol: string; name: string; exchange: string; asset_subtype: string | null;
  close: number | null; change_pct: number | null; dollar_volume: number | null; last_ts: string | null;
  degree: string; kind: SetupKind; side: "buy" | "sell"; status: "active" | "waiting";
  score: number | null; rr: number; risk_pct: number; setup: Setup | null;
  /** Direction of the weekly preferred count's move in progress, when a weekly count exists. */
  weekly_dir: "up" | "down" | null;
  /** The setup kind's replayed record (setup_kind_quality); null until graded. */
  grade: Grade | null; kind_avg_r: number | null;
  total: number;
}

export interface SetupScanParams {
  p_side?: string | null; p_status?: string | null; p_kind?: string | null; p_min_rr?: number | null;
  p_min_score?: number | null; p_min_dollar_volume?: number | null; p_sort?: string; p_limit?: number; p_offset?: number;
  p_aligned?: boolean | null; p_exclude_negative?: boolean | null;
}

/** Securities whose preferred daily count defines a setup (setup_scan). */
export async function setupScan(p: SetupScanParams): Promise<SetupRow[]> {
  const { data, error } = await db().rpc("setup_scan", { p_timeframe: "1d", ...p });
  if (error) throw new Error(error.message);
  return ((data ?? []) as SetupRow[]).map((r) => ({ ...r, total: Number(r.total) }));
}
