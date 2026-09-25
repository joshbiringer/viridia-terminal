/** US equity market hours in Eastern time, with NYSE full-day holidays. Early closes are not modeled. */

export const NYSE_HOLIDAYS = new Set([
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03",
  "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05",
  "2027-09-06", "2027-11-25", "2027-12-24",
]);

function etParts(d: Date) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, minutes: Number(g("hour")) * 60 + Number(g("minute")), weekday: g("weekday") };
}

export type MarketState = "open" | "pre" | "after" | "closed" | "holiday";

export function marketState(now = new Date()): { state: MarketState; label: string } {
  const { date, minutes, weekday } = etParts(now);
  if (weekday === "Sat" || weekday === "Sun") return { state: "closed", label: "U.S. markets are closed for the weekend." };
  if (NYSE_HOLIDAYS.has(date)) return { state: "holiday", label: "U.S. markets are closed for a holiday." };
  if (minutes < 4 * 60) return { state: "closed", label: "U.S. markets are closed." };
  if (minutes < 9 * 60 + 30) return { state: "pre", label: "U.S. markets open at 9:30 a.m. ET." };
  if (minutes < 16 * 60) return { state: "open", label: "U.S. markets are open." };
  if (minutes < 20 * 60) return { state: "after", label: "U.S. markets have closed for the day." };
  return { state: "closed", label: "U.S. markets are closed." };
}

export function greeting(now = new Date()) {
  const h = Math.floor(etParts(now).minutes / 60);
  return h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening.";
}
