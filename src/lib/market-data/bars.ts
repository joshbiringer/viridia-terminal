/** Client-safe helpers and types for price bars served by get_bars() / request_price_history(). */

export type ChartTimeframe = "1h" | "4h" | "1d" | "1w" | "1mo";

export const TIMEFRAMES: { id: ChartTimeframe; label: string; limit: number }[] = [
  { id: "1h", label: "1H", limit: 1500 },
  { id: "4h", label: "4H", limit: 600 },
  { id: "1d", label: "1D", limit: 600 },
  { id: "1w", label: "1W", limit: 260 },
  { id: "1mo", label: "1M", limit: 120 },
];

export const isChartTimeframe = (v: string | null): v is ChartTimeframe => TIMEFRAMES.some((t) => t.id === v);

/** The stored timeframe each chart timeframe is built from (4h, 1w and 1mo are resampled). */
export const nativeFor = (tf: ChartTimeframe): "1h" | "1d" => (tf === "1h" || tf === "4h" ? "1h" : "1d");
export const isIntraday = (tf: ChartTimeframe) => tf === "1h" || tf === "4h";

export interface BarRow {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type HistoryState = "ready" | "queued" | "no_data" | "busy" | "unknown_symbol" | "unsupported_timeframe" | "error";
export interface HistoryStatus {
  status: HistoryState;
  position?: number;
  eta_seconds?: number;
}

export interface BarsResponse {
  symbol: string;
  timeframe: ChartTimeframe;
  history: HistoryStatus | null;
  bars: BarRow[];
  pivots?: import("@/lib/analysis/pivots").ClientPivots | null;
}

export interface Coverage {
  status: "ready" | "queued" | "no_data" | "error";
  first_ts: string | null;
  last_ts: string | null;
  history_complete: boolean;
  last_fetch_at: string | null;
  error: string | null;
}

export interface BarSummary {
  last_ts: string | null;
  last_close: number | null;
  prev_close: number | null;
  high_52w: number | null;
  low_52w: number | null;
  avg_volume_50d: number | null;
  bars_1d: number;
  first_ts: string | null;
  coverage: "full" | "on_demand" | null;
  coverage_1d: Coverage | null;
  coverage_1h: Coverage | null;
}

/**
 * Chart time for a bar. Daily and longer bars are business days (YYYY-MM-DD, stored at 00:00 UTC).
 * Intraday bars are shifted to US/Eastern wall-clock time, because the chart library renders in UTC.
 */
export function chartTime(iso: string, tf: ChartTimeframe): string | number {
  if (!isIntraday(tf)) return iso.slice(0, 10);
  return etWallSeconds(iso);
}

export function etWallSeconds(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) / 1000;
}

export function fmtPrice(v: number | null | undefined) {
  if (v == null || !isFinite(v)) return "—";
  const d = Math.abs(v) >= 1 ? 2 : 4;
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** A price change, with the decimals of the price it belongs to (−0.19, not −0.1900, for a $5 stock). */
export function fmtChange(change: number, reference: number) {
  const d = Math.abs(reference) >= 1 ? 2 : 4;
  return Math.abs(change).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtVolume(v: number | null | undefined) {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(Math.round(v));
}
