import { NextResponse, type NextRequest } from "next/server";
import { secJson } from "@/lib/fundamentals/sec";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Submissions { cik: string; name: string; sic: string; sicDescription: string; ownerOrg?: string; fiscalYearEnd?: string }

/** SIC code, description and fiscal year end for up to 20 CIKs, fetched at under 8 requests a second. */
export async function GET(req: NextRequest) {
  const ciks = (req.nextUrl.searchParams.get("ciks") ?? "").split(",").map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0).slice(0, 20);
  if (!ciks.length) return NextResponse.json({ error: "No CIKs." }, { status: 400 });
  const companies: unknown[] = [], missing: number[] = [];
  for (let i = 0; i < ciks.length; i += 4) {
    const started = Date.now();
    const got = await Promise.all(ciks.slice(i, i + 4).map(async (cik) => {
      try {
        const s = await secJson<Submissions>(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`);
        return { cik, name: s.name, sic: s.sic || null, sic_description: s.sicDescription || null, owner_org: s.ownerOrg || null, fiscal_year_end: s.fiscalYearEnd || null };
      } catch (e) {
        if ((e as Error).message.startsWith("SEC 404")) { missing.push(cik); return null; }
        throw e;
      }
    })).catch((e: Error) => e);
    if (got instanceof Error) return NextResponse.json({ error: got.message }, { status: 502 });
    companies.push(...got.filter(Boolean));
    const wait = 550 - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  return NextResponse.json({ companies, missing });
}
