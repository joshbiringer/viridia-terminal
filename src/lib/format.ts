import { EXCHANGE_LABEL } from "@shared/security-master.ts";

export const exchangeLabel = (mic: string | null) => (mic ? EXCHANGE_LABEL[mic] ?? mic : "—");

export const SUBTYPE_LABEL: Record<string, string> = {
  common: "Common stock", etf: "ETF", preferred: "Preferred", warrant: "Warrant", unit: "Unit",
  right: "Right", note: "Exchange-traded note", index: "Index", other: "Other",
};
export const subtypeLabel = (s: string) => SUBTYPE_LABEL[s] ?? s;

export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short",
  });
}
export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

/** Canonical symbols can contain ^ . - ; always encode for URLs. */
export const stockHref = (symbol: string) => `/terminal/${encodeURIComponent(symbol)}`;
