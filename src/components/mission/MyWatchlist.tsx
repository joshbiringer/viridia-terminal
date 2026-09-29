"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtPrice } from "@/lib/market-data/bars";
import { EVENT_LABEL, SWING_LABEL, eventSentence, eventTone } from "@/lib/analysis/events";
import { fmtPct, waveShort } from "@/lib/analysis/mission";
import type { WatchRow } from "@/lib/analysis/mission-page";
import { TickerButton } from "./SecurityDrawer";

type SortKey = "change" | "structure" | "wave" | "fib" | "move";
const SORTS: [SortKey, string][] = [["change", "Latest change"], ["structure", "Structure"], ["wave", "Wave"], ["fib", "Fib proximity"], ["move", "Daily move"]];
const STRUCT_ORDER: Record<string, number> = { higher_highs_lows: 0, expanding: 1, contracting: 2, lower_highs_lows: 3, insufficient: 4 };

/** Distance from the close to the nearest Fibonacci confluence zone (0 inside it), or null. */
function fibDist(r: WatchRow) {
  if (!r.close || r.zone_low == null || r.zone_high == null) return null;
  if (r.close >= r.zone_low && r.close <= r.zone_high) return 0;
  const edge = r.close < r.zone_low ? r.zone_low : r.zone_high;
  return edge / r.close - 1;
}

/** Signed-in rail: the reader's watchlist with structure, wave, nearest Fib zone and last Viridia change; sortable. */
export function MyWatchlist({ rows }: { rows: WatchRow[] }) {
  const [sort, setSort] = useState<SortKey>("change");
  const sorted = useMemo(() => {
    const out = [...rows];
    const nz = (v: number | null | undefined, d: number) => (v == null ? d : v);
    out.sort((a, b) => {
      switch (sort) {
        case "change": return (b.event_day ?? "").localeCompare(a.event_day ?? "");
        case "structure": return nz(STRUCT_ORDER[a.swing ?? ""], 9) - nz(STRUCT_ORDER[b.swing ?? ""], 9);
        case "wave": return nz(b.score, -1) - nz(a.score, -1);
        case "fib": return Math.abs(nz(fibDist(a), 9)) - Math.abs(nz(fibDist(b), 9));
        case "move": return Math.abs(nz(b.change_pct, 0)) - Math.abs(nz(a.change_pct, 0));
      }
    });
    return out;
  }, [rows, sort]);

  return (
    <section className="card" aria-labelledby="mwl-t">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h2 id="mwl-t" className="card-t">My watchlist</h2>
        <span className="text-[12px] text-fg-3">{rows.length}</span>
        <Link href="/watchlist" className="btn ghost sm ml-auto">Manage</Link>
      </div>
      <label className="flex items-center gap-2 border-b border-line px-4 py-1.5 text-[11.5px] text-fg-3">
        Sort
        <select className="ml-auto rounded-[var(--r-sm)] border border-line bg-panel px-1.5 py-0.5 text-[12px] text-fg" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <ul className="divide-y divide-line">
        {sorted.map((r) => {
          const wave = waveShort(r.pattern, r.complete, r.wave, r.wave_dir);
          const fd = fibDist(r);
          const ev = r.event_type ? { type: r.event_type, detail: r.event_detail ?? {} } : null;
          const tone = ev ? eventTone(ev) : "neutral";
          return (
            <li key={r.symbol}>
              <TickerButton symbol={r.symbol} className="block px-4 py-1.5 transition-colors hover:bg-hover">
                <span className="flex items-baseline gap-2">
                  <span className="tk w-14 text-[13px]">{r.symbol}</span>
                  <span className="num ml-auto text-[13px]">{fmtPrice(r.close)}</span>
                  <span className={`num w-[58px] text-right text-[12.5px] font-medium ${r.change_pct == null ? "text-fg-3" : r.change_pct >= 0 ? "text-pos" : "text-neg"}`}>{fmtPct(r.change_pct)}</span>
                </span>
                <span className="mt-0.5 grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-[11.5px] text-fg-3">
                  <span className="truncate" title={r.swing ? `Intermediate structure: ${SWING_LABEL[r.swing] ?? r.swing}` : undefined}>
                    {r.swing ? SWING_LABEL[r.swing] ?? r.swing : "No structure yet"} · {wave ?? "no count"}
                  </span>
                  <span className="num" title="Nearest Fibonacci confluence zone">
                    {fd == null ? "No Fib zone" : fd === 0 ? "In Fib zone" : `Fib ${fmtPct(fd)}`}
                  </span>
                </span>
                {ev && (
                  <span className="mt-0.5 block truncate text-[11.5px] leading-snug" title={eventSentence(ev)}
                    style={{ color: tone === "pos" ? "var(--pos)" : tone === "neg" ? "var(--neg)" : "var(--fg-2)" }}>
                    {r.event_day?.slice(5)} · {EVENT_LABEL[ev.type]}: {eventSentence(ev)}
                  </span>
                )}
              </TickerButton>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
