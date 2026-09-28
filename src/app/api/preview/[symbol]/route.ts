import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import type { SecurityPreview } from "@/lib/analysis/mission";

/** Compact security preview for Mission Control's right-side drawer. */
export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol).trim().toUpperCase().slice(0, 12);
  if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) return NextResponse.json({ error: "Not a ticker." }, { status: 400 });
  const { data, error } = await db().rpc("security_preview", { p_symbol: symbol });
  if (error) return NextResponse.json({ error: "The preview couldn't be loaded." }, { status: 502 });
  if (!data) return NextResponse.json({ error: `No security with the ticker ${symbol}.` }, { status: 404 });
  return NextResponse.json(data as SecurityPreview, { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } });
}
