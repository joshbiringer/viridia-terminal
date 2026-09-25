import Link from "next/link";
import { fmtPrice } from "@/lib/market-data/bars";
import { fmtDollars, pct, type ScanRow } from "@/lib/market-data/snapshot";
import { exchangeLabel, stockHref } from "@/lib/format";
import { TrendLabel } from "./TrendLabel";

export function ScannerTable({ rows, compact = false }: { rows: ScanRow[]; compact?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="t dense">
        <thead>
          <tr>
            <th>Ticker</th>
            <th className={compact ? "hidden md:table-cell" : ""}>Company</th>
            <th className="r">Price</th>
            <th className="r">Change</th>
            <th>Trend</th>
            <th className="r hidden sm:table-cell">vs 50-day</th>
            <th className="r hidden sm:table-cell">vs 200-day</th>
            <th className="r hidden lg:table-cell">From 52w high</th>
            {!compact && <th className="r hidden xl:table-cell">$ volume (20d)</th>}
            {!compact && <th className="hidden 2xl:table-cell">Exchange</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol}>
              <td><Link href={stockHref(r.symbol)} className="tk hover:text-brand">{r.symbol}</Link></td>
              <td className={`max-w-[280px] truncate text-fg-2 ${compact ? "hidden md:table-cell" : ""}`}>{r.name}</td>
              <td className="r num">{fmtPrice(r.close)}</td>
              <td className={`r num ${r.change_pct == null ? "text-fg-3" : r.change_pct >= 0 ? "text-pos" : "text-neg"}`}>{pct(r.change_pct)}</td>
              <td><TrendLabel trend={r.trend} /></td>
              <td className="r num hidden text-fg-2 sm:table-cell">{pct(r.vs_sma50, 1)}</td>
              <td className="r num hidden text-fg-2 sm:table-cell">{pct(r.vs_sma200, 1)}</td>
              <td className="r num hidden text-fg-2 lg:table-cell">{pct(r.from_high, 1)}</td>
              {!compact && <td className="r num hidden text-fg-2 xl:table-cell">{fmtDollars(r.dollar_volume)}</td>}
              {!compact && <td className="hidden text-fg-3 2xl:table-cell">{exchangeLabel(r.exchange)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
