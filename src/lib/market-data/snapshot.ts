/** Types and server helpers for the security snapshot (migration 0007). */
import { db } from "@/lib/supabase";

export type Trend = "uptrend" | "mixed" | "downtrend" | "insufficient";

export interface Breadth {
  universe: number; measured: number; uptrend: number; mixed: number; downtrend: number; insufficient: number;
  above_sma50: number; measured_50: number; above_sma200: number; near_52w_high: number; near_52w_low: number;
  advancers: number; decliners: number; as_of: string | null; refreshed_at: string | null;
}

export interface Snapshot {
  symbol: string; close: number | null; prev_close: number | null; last_ts: string | null;
  sma50: number | null; sma200: number | null; sma50_prior: number | null; n50: number; n200: number;
  high_52w: number | null; low_52w: number | null; adv20: number | null; bars: number; trend: Trend;
}

export interface ScanRow {
  symbol: string; name: string; exchange: string | null; asset_subtype: string; close: number | null;
  change_pct: number | null; trend: Trend; vs_sma50: number | null; vs_sma200: number | null;
  from_high: number | null; range_pos: number | null; dollar_volume: number | null; last_ts: string | null; total: number;
}

export interface OverviewRow { symbol: string; name: string; close: number | null; prev_close: number | null; last_ts: string | null; spark: number[] }

/** Index data isn't in the free data plan, so the overview uses liquid ETFs that track each market. */
export const MARKET_PROXIES: { symbol: string; label: string }[] = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq-100" },
  { symbol: "DIA", label: "Dow Jones" },
  { symbol: "IWM", label: "Russell 2000" },
  { symbol: "TLT", label: "20+ yr Treasuries" },
  { symbol: "GLD", label: "Gold" },
];

export const TREND_LABEL: Record<Trend, string> = {
  uptrend: "Uptrend", mixed: "Mixed", downtrend: "Downtrend", insufficient: "Measuring",
};
export const TREND_METHOD = "Price versus its 50- and 200-day averages: above both with the 50 above the 200 is an uptrend, below both with the 50 below the 200 is a downtrend, anything else is mixed.";

export async function getOverview(): Promise<OverviewRow[]> {
  const { data, error } = await db().rpc("market_overview", { p_symbols: MARKET_PROXIES.map((m) => m.symbol) });
  if (error) throw new Error(error.message);
  return (data ?? []) as OverviewRow[];
}

export async function getBreadth(): Promise<Breadth | null> {
  const { data, error } = await db().rpc("market_breadth");
  if (error) throw new Error(error.message);
  return (data as Breadth) ?? null;
}

export async function scan(params: Record<string, unknown> = {}): Promise<ScanRow[]> {
  const { data, error } = await db().rpc("scan_securities", params);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ScanRow[]).map((r) => ({ ...r, total: Number(r.total) }));
}

export const pct = (v: number | null | undefined, d = 2) =>
  v == null || !isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(d)}%`;

export function fmtDollars(v: number | null | undefined) {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
