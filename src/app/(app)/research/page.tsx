import Link from "next/link";
import type { Metadata } from "next";
import { scan } from "@/lib/market-data/snapshot";
import { fmtPrice } from "@/lib/market-data/bars";
import { stockHref } from "@/lib/format";
import { OpenPaletteButton } from "@/components/OpenPaletteButton";

export const metadata: Metadata = { title: "Research" };
export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const [stocks, etfs] = await Promise.all([
    scan({ p_type: "common", p_sort: "dollar_volume", p_limit: 24 }),
    scan({ p_type: "etf", p_sort: "dollar_volume", p_limit: 12 }),
  ]);
  return (
    <>
      <section className="flex max-w-[760px] flex-col gap-5 pt-2">
        <h1 className="h2">Research any company.</h1>
        <p className="lede">Open any of the 13,000+ securities listed on U.S. exchanges. Price history for names outside the automatic universe is fetched the first time you open them.</p>
        <OpenPaletteButton label="Search ticker or company" className="btn lg w-full max-w-[440px] justify-start text-fg-3" />
      </section>
      {[["Most active stocks", stocks], ["Most active ETFs", etfs]].map(([title, rows]) => (
        <section key={title as string} className="flex flex-col gap-3">
          <h2 className="h3">{title as string}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {(rows as typeof stocks).map((r) => (
              <Link key={r.symbol} href={stockHref(r.symbol)} className="card lift flex flex-col gap-1 px-4 py-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="tk text-[15px]">{r.symbol}</span>
                  <span className={`num text-[12.5px] font-medium ${r.change_pct == null ? "text-fg-3" : r.change_pct >= 0 ? "text-pos" : "text-neg"}`}>
                    {r.change_pct == null ? "—" : `${r.change_pct >= 0 ? "+" : "−"}${Math.abs(r.change_pct * 100).toFixed(2)}%`}
                  </span>
                </div>
                <span className="truncate text-[12.5px] text-fg-3">{r.name}</span>
                <span className="num mt-1 text-[15px] font-medium">{fmtPrice(r.close)}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
