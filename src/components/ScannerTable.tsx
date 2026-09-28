import Link from "next/link";
import { fmtPrice } from "@/lib/market-data/bars";
import { fmtDollars, pct, type ScanRow } from "@/lib/market-data/snapshot";
import { exchangeLabel, stockHref } from "@/lib/format";
import { PATTERN_LABEL, type CandidatePattern } from "@/lib/analysis/candidates";
import { TrendLabel } from "./TrendLabel";

/** "Impulse · wave 3 ↑" for the preferred daily count, or null when none is ranked yet. */
export function countLabel(r: ScanRow): string | null {
  if (!r.glance_pattern || !r.glance_wave) return null;
  const arrow = r.glance_wave_dir === "up" ? "↑" : "↓";
  const name = PATTERN_LABEL[r.glance_pattern as CandidatePattern] ?? r.glance_pattern;
  return r.glance_complete ? `${name} complete ${arrow}` : `${name} · wave ${r.glance_wave} ${arrow}`;
}

export function ScannerTable({ rows, compact = false, structure = false }: { rows: ScanRow[]; compact?: boolean; structure?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="t dense">
        <thead>
          <tr>
            <th>Ticker</th>
            <th className={compact || structure ? "hidden md:table-cell" : ""}>Company</th>
            <th className="r">Price</th>
            <th className="r">Change</th>
            {structure ? (
              <>
                <th>Preferred count</th>
                <th className="r" title="Pattern Confidence of the preferred count">Conf.</th>
                <th className="r hidden sm:table-cell" title="Distance from the close to the preferred count's invalidation level">To invalidation</th>
                <th className="r hidden lg:table-cell" title="Distance to the nearest Fibonacci confluence zone">To zone</th>
                <th className="hidden xl:table-cell">Trend</th>
              </>
            ) : (
              <>
                <th>Trend</th>
                <th className="r hidden sm:table-cell">vs 50-day</th>
                <th className="r hidden sm:table-cell">vs 200-day</th>
                <th className="r hidden lg:table-cell">From 52w high</th>
              </>
            )}
            {!compact && <th className="r hidden xl:table-cell">$ volume (20d)</th>}
            {!compact && <th className="hidden 2xl:table-cell">Exchange</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const count = countLabel(r);
            return (
              <tr key={r.symbol}>
                <td><Link href={stockHref(r.symbol)} className="tk hover:text-brand">{r.symbol}</Link></td>
                <td className={`max-w-[280px] truncate text-fg-2 ${compact || structure ? "hidden md:table-cell" : ""}`}>{r.name}</td>
                <td className="r num">{fmtPrice(r.close)}</td>
                <td className={`r num ${r.change_pct == null ? "text-fg-3" : r.change_pct >= 0 ? "text-pos" : "text-neg"}`}>{pct(r.change_pct)}</td>
                {structure ? (
                  <>
                    <td className="whitespace-nowrap">{count ?? <span className="text-fg-3">Not ranked yet</span>}</td>
                    <td className="r num font-medium">{r.glance_score ?? "—"}</td>
                    <td className="r num hidden text-fg-2 sm:table-cell">{pct(r.hold_dist ?? null, 1)}</td>
                    <td className="r num hidden text-fg-2 lg:table-cell">{r.zone_dist != null ? `${(r.zone_dist * 100).toFixed(1)}%` : "—"}</td>
                    <td className="hidden xl:table-cell"><TrendLabel trend={r.trend} /></td>
                  </>
                ) : (
                  <>
                    <td><TrendLabel trend={r.trend} /></td>
                    <td className="r num hidden text-fg-2 sm:table-cell">{pct(r.vs_sma50, 1)}</td>
                    <td className="r num hidden text-fg-2 sm:table-cell">{pct(r.vs_sma200, 1)}</td>
                    <td className="r num hidden text-fg-2 lg:table-cell">{pct(r.from_high, 1)}</td>
                  </>
                )}
                {!compact && <td className="r num hidden text-fg-2 xl:table-cell">{fmtDollars(r.dollar_volume)}</td>}
                {!compact && <td className="hidden text-fg-3 2xl:table-cell">{exchangeLabel(r.exchange)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
