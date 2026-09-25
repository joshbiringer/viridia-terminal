import Link from "next/link";
import type { Metadata } from "next";
import { getBreadth, getOverview, scan } from "@/lib/market-data/snapshot";
import { fmtDate } from "@/lib/format";
import { MarketStrip } from "@/components/MarketStrip";
import { BreadthSummary } from "@/components/BreadthSummary";
import { ScannerTable } from "@/components/ScannerTable";

export const metadata: Metadata = { title: "Markets" };
export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  const liquid = { p_min_dollar_volume: 25_000_000, p_limit: 8 };
  const [overview, breadth, gainers, decliners] = await Promise.all([
    getOverview(), getBreadth(), scan({ ...liquid, p_sort: "change" }), scan({ ...liquid, p_sort: "change_asc" }),
  ]);
  return (
    <>
      <section className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="h2">Markets</h1>
          <p className="lede mt-2">U.S. equities at the last close, {fmtDate(overview[0]?.last_ts)}.</p>
        </div>
        <div className="flex gap-2"><Link href="/markets/stocks" className="btn">All stocks</Link><Link href="/markets/etfs" className="btn">All ETFs</Link></div>
      </section>
      <MarketStrip rows={overview} />
      {breadth && <BreadthSummary b={breadth} />}
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card">
          <div className="card-h"><div><h2 className="card-t">Leading today</h2><p className="card-s mt-0.5">Largest gains among names trading $25M+ a day</p></div></div>
          <ScannerTable rows={gainers} compact />
        </section>
        <section className="card">
          <div className="card-h"><div><h2 className="card-t">Lagging today</h2><p className="card-s mt-0.5">Largest declines among names trading $25M+ a day</p></div></div>
          <ScannerTable rows={decliners} compact />
        </section>
      </div>
    </>
  );
}
