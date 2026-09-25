import Link from "next/link";
import { MARKET_PROXIES, pct, type OverviewRow } from "@/lib/market-data/snapshot";
import { fmtPrice } from "@/lib/market-data/bars";
import { stockHref } from "@/lib/format";
import { Sparkline } from "./Sparkline";

export function MarketStrip({ rows }: { rows: OverviewRow[] }) {
  const by = new Map(rows.map((r) => [r.symbol, r]));
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line bg-line shadow-[var(--shadow-sm)] md:grid-cols-3 xl:grid-cols-6">
      {MARKET_PROXIES.map((m) => {
        const r = by.get(m.symbol);
        const chg = r?.close != null && r.prev_close ? r.close / r.prev_close - 1 : null;
        return (
          <Link
            key={m.symbol} href={stockHref(m.symbol)}
            className="group flex flex-col gap-1 bg-panel px-5 py-4 transition-colors hover:bg-hover"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium text-fg-2">{m.label}</span>
              <span className="text-[11.5px] text-fg-3">{m.symbol}</span>
            </div>
            <div className="num text-[20px] font-[600] tracking-[-0.02em]">{r ? fmtPrice(r.close) : "—"}</div>
            <div className="flex items-end justify-between gap-2">
              <span className={`num text-[13px] font-medium ${chg == null ? "text-fg-3" : chg >= 0 ? "text-pos" : "text-neg"}`}>{pct(chg)}</span>
              {r && <Sparkline values={r.spark} width={84} height={26} />}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
