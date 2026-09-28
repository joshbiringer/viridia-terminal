/**
 * World market hubs for the Brief's globe: where each exchange is, its local time and whether its
 * regular session is open. Regular weekday hours only; exchange holidays other than NYSE's are not
 * modeled, so a closed-for-holiday market can read as open.
 */
import { NYSE_HOLIDAYS } from "./market-hours";

export type HubId = "sf" | "ny" | "london" | "frankfurt" | "hongkong" | "tokyo";

export interface Hub {
  id: HubId;
  city: string;
  exchange: string;
  lat: number;
  lon: number;
  tz: string;
  /** Regular sessions in local minutes after midnight. */
  sessions: [number, number][];
  /** Holidays known for this exchange (ISO dates, local). */
  holidays?: Set<string>;
}

const m = (h: number, min = 0) => h * 60 + min;

export const HUBS: Hub[] = [
  { id: "sf", city: "San Francisco", exchange: "U.S. session (NYSE, Nasdaq)", lat: 37.77, lon: -122.42, tz: "America/Los_Angeles", sessions: [[m(6, 30), m(13)]], holidays: NYSE_HOLIDAYS },
  { id: "ny", city: "New York", exchange: "NYSE and Nasdaq", lat: 40.71, lon: -74.01, tz: "America/New_York", sessions: [[m(9, 30), m(16)]], holidays: NYSE_HOLIDAYS },
  { id: "london", city: "London", exchange: "London Stock Exchange", lat: 51.51, lon: -0.09, tz: "Europe/London", sessions: [[m(8), m(16, 30)]] },
  { id: "frankfurt", city: "Frankfurt", exchange: "Deutsche Börse Xetra", lat: 50.11, lon: 8.68, tz: "Europe/Berlin", sessions: [[m(9), m(17, 30)]] },
  { id: "hongkong", city: "Hong Kong", exchange: "Hong Kong Exchanges", lat: 22.28, lon: 114.16, tz: "Asia/Hong_Kong", sessions: [[m(9, 30), m(12)], [m(13), m(16)]] },
  { id: "tokyo", city: "Tokyo", exchange: "Tokyo Stock Exchange", lat: 35.68, lon: 139.77, tz: "Asia/Tokyo", sessions: [[m(9), m(11, 30)], [m(12, 30), m(15, 30)]] },
];

export type SessionState = "open" | "break" | "closed";

export interface HubStatus {
  state: SessionState;
  localTime: string;
  /** "Closes in 2h 14m", "Opens in 45m", "Opens Monday 9:30". */
  next: string;
}

function local(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, minutes: Number(g("hour")) * 60 + Number(g("minute")), weekday: g("weekday") };
}

const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`);
const clock = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

export function hubStatus(h: Hub, now = new Date()): HubStatus {
  const { date, minutes, weekday } = local(now, h.tz);
  const localTime = new Intl.DateTimeFormat("en-US", { timeZone: h.tz, hour: "numeric", minute: "2-digit" }).format(now);
  const weekend = weekday === "Sat" || weekday === "Sun";
  const holiday = h.holidays?.has(date) ?? false;
  const first = h.sessions[0][0], last = h.sessions[h.sessions.length - 1][1];
  if (weekend || holiday) {
    return { state: "closed", localTime, next: holiday ? "Closed for a holiday" : `Opens Monday ${clock(first)}` };
  }
  for (const [a, b] of h.sessions) if (minutes >= a && minutes < b) return { state: "open", localTime, next: `Closes in ${dur(b - minutes)}` };
  const later = h.sessions.find(([a]) => a > minutes);
  if (later && minutes > first) return { state: "break", localTime, next: `Reopens in ${dur(later[0] - minutes)}` };
  if (later) return { state: "closed", localTime, next: `Opens in ${dur(later[0] - minutes)}` };
  return { state: "closed", localTime, next: weekday === "Fri" ? `Opens Monday ${clock(first)}` : `Closed at ${clock(last)}` };
}
