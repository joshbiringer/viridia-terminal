"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { SearchHit } from "@/lib/types";
import { exchangeLabel, fmtDate, stockHref } from "@/lib/format";
import { fmtPrice } from "@/lib/market-data/bars";
import { fmtDollars, type Trend } from "@/lib/market-data/snapshot";
import { SWING_LABEL, type SwingStructure } from "@/lib/analysis/pivots";
import { addToWatchlist, removeFromWatchlist } from "@/lib/watchlist";
import { SecuritySearch } from "./SecuritySearch";
import { TrendLabel } from "./TrendLabel";
import { EmptyState } from "./ui/EmptyState";
import { Icon } from "./Icon";

export type WatchRow = {
  watchlist_id: string; security_id: number; symbol: string; name: string; exchange: string | null; asset_type: string;
  close: number | null; prev_close: number | null; change_pct: number | null; trend: Trend | null;
  high_52w: number | null; low_52w: number | null; adv20: number | null; last_ts: string | null;
  swing: SwingStructure | null; zones: number; added_at: string;
};

const SWING_TONE: Partial<Record<SwingStructure, string>> = { higher_highs_lows: "text-pos", lower_highs_lows: "text-neg" };

export function WatchlistView({ userId, initial, asOf }: { userId: string; initial: WatchRow[]; asOf: string | null }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const add = async (h: SearchHit) => {
    setErr(null);
    try {
      await addToWatchlist(userId, h.id, h.symbol);
      start(() => router.refresh());
      // show it right away; market data fills in on refresh
      setRows((r) => r.some((x) => x.security_id === h.id) ? r : [...r, {
        watchlist_id: "", security_id: h.id, symbol: h.symbol, name: h.name, exchange: h.exchange, asset_type: h.asset_type,
        close: null, prev_close: null, change_pct: null, trend: null, high_52w: null, low_52w: null, adv20: null, last_ts: null,
        swing: null, zones: 0, added_at: new Date().toISOString(),
      }]);
    } catch (e) { setErr((e as Error).message); }
  };
  const remove = async (id: number) => {
    const before = rows;
    setRows((r) => r.filter((x) => x.security_id !== id));
    try { await removeFromWatchlist(id); } catch (e) { setRows(before); setErr((e as Error).message); }
  };

  // after a refresh the server sends complete market data for newly added rows
  useEffect(() => { setRows(initial); }, [initial]);

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
        <div className="w-full sm:max-w-[360px]"><SecuritySearch onPick={add} exclude={rows.map((r) => r.security_id)} placeholder="Add a ticker or company…" /></div>
        <span className="caption ml-auto">{rows.length} {rows.length === 1 ? "security" : "securities"}{asOf ? ` · close ${fmtDate(asOf)}` : ""}</span>
      </div>
      {err && <p className="border-b border-line px-5 py-2.5 text-[13px] text-neg">{err}</p>}
      {rows.length === 0 ? (
        <EmptyState
          icon="watchlist" title="Build your market radar"
          body="Add the securities you follow to see their trend, swing structure and nearby Fibonacci zones side by side, updated after every close."
        >
          <Link href="/scanner" className="btn">Browse the scanner</Link>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="t min-w-[860px]">
            <thead>
              <tr>
                <th>Security</th><th className="r">Last</th><th className="r">Change</th><th>Trend</th>
                <th>Swing structure</th><th className="r">Fib zones</th><th className="r">52-week range</th><th className="r">$ Vol, 20d</th><th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pos = r.close != null && r.high_52w && r.low_52w && r.high_52w > r.low_52w ? (r.close - r.low_52w) / (r.high_52w - r.low_52w) : null;
                return (
                  <tr key={r.security_id}>
                    <td>
                      <Link href={stockHref(r.symbol)} className="flex items-baseline gap-2.5">
                        <span className="tk w-14">{r.symbol}</span>
                        <span className="max-w-[240px] truncate text-fg-2">{r.name}</span>
                        <span className="text-[12px] text-fg-3">{exchangeLabel(r.exchange)}</span>
                      </Link>
                    </td>
                    <td className="r num">{r.close != null ? fmtPrice(r.close) : <span className="text-fg-3">—</span>}</td>
                    <td className={`r num ${r.change_pct == null ? "text-fg-3" : r.change_pct >= 0 ? "text-pos" : "text-neg"}`}>
                      {r.change_pct == null ? "—" : `${r.change_pct >= 0 ? "+" : "−"}${Math.abs(r.change_pct * 100).toFixed(2)}%`}
                    </td>
                    <td>{r.trend ? <TrendLabel trend={r.trend} /> : <span className="text-fg-3">—</span>}</td>
                    <td className={r.swing ? SWING_TONE[r.swing] ?? "" : "text-fg-3"}>{r.swing ? SWING_LABEL[r.swing] : "Loading history"}</td>
                    <td className="r num">{r.zones || <span className="text-fg-3">—</span>}</td>
                    <td className="r">
                      {pos == null ? <span className="text-fg-3">—</span> : (
                        <span className="ml-auto flex w-[120px] items-center gap-2">
                          <span className="relative h-1 flex-1 rounded-full bg-hover"><span className="absolute top-1/2 h-2.5 w-[2px] -translate-y-1/2 rounded bg-fg" style={{ left: `${pos * 100}%` }} /></span>
                          <span className="num w-8 text-right text-[12px] text-fg-3">{Math.round(pos * 100)}%</span>
                        </span>
                      )}
                    </td>
                    <td className="r num text-fg-2">{fmtDollars(r.adv20)}</td>
                    <td className="w-10 !px-2">
                      <button className="btn ghost sm px-2 text-fg-3" onClick={() => remove(r.security_id)} aria-label={`Remove ${r.symbol}`} title="Remove">
                        <Icon name="x" className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
