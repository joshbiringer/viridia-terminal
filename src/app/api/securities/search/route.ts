import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase";
import type { SearchHit } from "@/lib/types";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 64);
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 10, 1), 50);
  const includeInactive = req.nextUrl.searchParams.get("inactive") === "1";
  if (!q) return NextResponse.json({ results: [] });

  try {
    const { data, error } = await db().rpc("search_securities", { q, lim: limit, include_inactive: includeInactive });
    if (error) throw error;
    return NextResponse.json(
      { results: (data ?? []) as SearchHit[] },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
    );
  } catch {
    return NextResponse.json({ error: "Search is unavailable right now." }, { status: 502 });
  }
}
