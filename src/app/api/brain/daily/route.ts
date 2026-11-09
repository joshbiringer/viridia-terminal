import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { brainSignals } from "@/lib/brain/server";
import { buildDailyList, formatDailyEmail, type DailyList } from "@/lib/brain/portfolio";
import type { Thesis } from "@/lib/brain/signal";
import type { Screen } from "@/lib/brain/screens";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SITE = "https://viridia-terminal-ten.vercel.app";
const etDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/**
 * Builds and saves the owner's daily model portfolio. Called by the database's morning job with the
 * owner's key in a header; the key is checked by the database, which also holds the private theses.
 * The response carries counts only, never the list itself.
 */
export async function GET(req: Request) {
  const key = req.headers.get("x-brain-key");
  if (!key || key.length < 32) return NextResponse.json({ error: "missing key" }, { status: 401 });
  const date = etDate();
  const { data: inputs, error } = await db().rpc("brain_daily_inputs_for", { p_key: key, p_date: date });
  if (error || !inputs) return NextResponse.json({ error: "invalid key" }, { status: 401 });
  const { theses, screens, previous } = inputs as { theses: Thesis[]; screens: Screen[]; previous: DailyList | null };
  const { signals, valueLive } = await brainSignals(theses, [], screens, { sectorPicks: true });
  const list = buildDailyList(signals, { date, valueLive, previous });
  const email = formatDailyEmail(list, SITE);
  const save = await db().rpc("brain_daily_save", { p_key: key, p_date: date, p_payload: list, p_email: email });
  if (save.error) return NextResponse.json({ error: save.error.message }, { status: 500 });
  return NextResponse.json({ date, stocks: list.stocks.length, etfs: list.etfs.length, buyToday: list.buyToday.length, scored: list.universe, valueLive });
}
