import { NextResponse, type NextRequest } from "next/server";
import { FRAME_CONCEPTS, isFramePeriod, secJson } from "@/lib/fundamentals/sec";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Frame { tag: string; ccp: string; data: { cik: number; val: number; end: string }[] }

/**
 * One XBRL frame (a concept for every filer in one calendar period) compacted to [cik, value, period end].
 * Postgres calls this through pg_net (sec_tick) and stores the rows; public data, no credentials.
 */
export async function GET(req: NextRequest) {
  const tag = req.nextUrl.searchParams.get("tag") ?? "";
  const period = req.nextUrl.searchParams.get("period") ?? "";
  const c = FRAME_CONCEPTS.find((x) => x.tag === tag);
  if (!c || !isFramePeriod(period)) return NextResponse.json({ error: "Unknown concept or period." }, { status: 400 });
  try {
    const f = await secJson<Frame>(`https://data.sec.gov/api/xbrl/frames/${c.taxonomy}/${c.tag}/${c.unit}/${period}.json`);
    return NextResponse.json({ tag, period, rows: f.data.map((d) => [d.cik, d.val, d.end]) });
  } catch (e) {
    const msg = (e as Error).message;
    // a frame SEC hasn't published (404) is a normal empty answer, not a failure to retry
    if (msg.startsWith("SEC 404")) return NextResponse.json({ tag, period, rows: [] });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
