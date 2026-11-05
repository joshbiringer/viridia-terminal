/**
 * How current Viridia's prices are, stated plainly. The licensed plan (Massive, formerly Polygon,
 * Stocks Basic) publishes end-of-day bars only, and only after midnight Eastern, so Viridia never
 * shows a live price: every number is a close, labelled with the session it belongs to.
 */
import { NYSE_HOLIDAYS } from "./market-hours";

export const DATA_SOURCE = {
  name: "Massive (formerly Polygon)",
  plan: "Stocks Basic",
  kind: "End of day" as const,
  coverage: "U.S.-listed stocks and ETFs",
  /** Grouped daily bars for a session become available at 00:30 ET the next morning. */
  publishesAt: "12:30 a.m. ET",
};

export interface DataStatusRow {
  last_session: string | null;
  ingested_at: string | null;
  analysed_at: string | null;
  pending_sessions: number;
  failed_sessions: string[];
  coverage: number;
}

export type FreshnessState = "current" | "behind" | "unknown";

export interface Freshness {
  state: FreshnessState;
  /** The session the prices belong to, e.g. "2026-11-04". */
  session: string | null;
  /** The newest session the provider has published. */
  expected: string;
  /** "Close of Wed, Nov 4" */
  label: string;
  /** One sentence for the status line. */
  detail: string;
  /** Sessions the provider has published that Viridia hasn't loaded. */
  missing: string[];
  /** True while the U.S. regular session is trading, when the close shown is not today's. */
  sessionLive: boolean;
}

function et(now: Date) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, minutes: Number(g("hour")) * 60 + Number(g("minute")) };
}

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const isSession = (iso: string) => {
  const dow = new Date(iso + "T00:00:00Z").getUTCDay();
  return dow !== 0 && dow !== 6 && !NYSE_HOLIDAYS.has(iso);
};

/** The newest session the provider has published at `now`: the last NYSE session that ended before 00:30 ET today. */
export function expectedSession(now = new Date()): string {
  const { date, minutes } = et(now);
  let d = addDays(date, minutes >= 30 ? -1 : -2);
  for (let i = 0; i < 10 && !isSession(d); i++) d = addDays(d, -1);
  return d;
}

/** NYSE sessions after `from` up to and including `to`. */
export function sessionsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = addDays(from, 1); d <= to && out.length < 30; d = addDays(d, 1)) if (isSession(d)) out.push(d);
  return out;
}

export const sessionLabel = (iso: string, withWeekday = true) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { ...(withWeekday ? { weekday: "short" as const } : {}), month: "short", day: "numeric", timeZone: "UTC" });

export function freshness(status: Pick<DataStatusRow, "last_session"> | null, now = new Date()): Freshness {
  const expected = expectedSession(now);
  const { date, minutes } = et(now);
  const sessionLive = isSession(date) && minutes >= 9 * 60 + 30 && minutes < 16 * 60;
  const session = status?.last_session ?? null;
  if (!session) {
    return { state: "unknown", session: null, expected, label: "Price date unknown", detail: "Viridia couldn't confirm which session its prices belong to.", missing: [], sessionLive };
  }
  const missing = session < expected ? sessionsBetween(session, expected) : [];
  const label = `Close of ${sessionLabel(session)}`;
  if (missing.length) {
    const which = missing.length === 1 ? `The ${sessionLabel(missing[0], false)} close` : `${missing.length} sessions (${sessionLabel(missing[0], false)}–${sessionLabel(missing[missing.length - 1], false)})`;
    return { state: "behind", session, expected, label, detail: `${which} ${missing.length === 1 ? "hasn't" : "haven't"} loaded yet; prices shown are from ${sessionLabel(session, false)}.`, missing, sessionLive };
  }
  const detail = sessionLive || (isSession(date) && minutes >= 16 * 60)
    ? `Today's session isn't included; end-of-day prices publish after ${DATA_SOURCE.publishesAt}.`
    : `Up to date. The next close publishes after ${DATA_SOURCE.publishesAt}.`;
  return { state: "current", session, expected, label, detail, missing, sessionLive };
}
