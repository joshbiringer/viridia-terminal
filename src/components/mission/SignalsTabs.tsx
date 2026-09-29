"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtPrice } from "@/lib/market-data/bars";
import { EVENT_LABEL, EVENTS_METHOD, eventSentence, eventTone, type StructureEvent } from "@/lib/analysis/events";
import { fmtPct, waveShort } from "@/lib/analysis/mission";
import type { AlignRow, FibRow, SignalsData } from "@/lib/analysis/mission-server";
import type { ScanRow } from "@/lib/market-data/snapshot";
import { TickerButton } from "./SecurityDrawer";

const TABS = [
  ["changes", "Structure changes"], ["wave", "Wave candidates"], ["fib", "Fib confluence"], ["invalidation", "Near invalidation"], ["mtf", "Multi-timeframe"],
] as const;
type Tab = (typeof TABS)[number][0];

const TONE = { pos: "var(--pos-chart)", neg: "var(--neg)", neutral: "var(--border-2)" } as const;
const DV = "dv=25000000";

/**
 * Signal detail on Mission Control: five views of what the engine produced for liquid names,
 * each from stored engine output. Tickers open the drawer; "All" links open the full screen.
 */
export function SignalsTabs({ events, data, day }: { events: StructureEvent[]; data: SignalsData; day: string | null }) {
  const [tab, setTab] = useState<Tab>("changes");
  const more: Record<Tab, { href: string; label: string }> = {
    changes: { href: "/scanner?view=structure", label: "Scanner" },
    wave: { href: `/scanner?s=wave3&${DV}&sort=confidence`, label: "All wave 3" },
    fib: { href: `/scanner?s=near_zone&${DV}&sort=zone`, label: "All near a zone" },
    invalidation: { href: `/scanner?s=near_invalidation&${DV}&sort=invalidation`, label: "All near invalidation" },
    mtf: { href: `/setups?wk=with`, label: "Setups with the weekly" },
  };
  return (
    <section className="card" aria-labelledby="sig-t">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2">
        <h2 id="sig-t" className="card-t">Signal detail</h2>
        <div className="seg" role="tablist" aria-label="Signal views">
          {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <Link href={more[tab].href} className="btn ghost sm ml-auto">{more[tab].label}</Link>
      </div>
      <div className="min-h-[260px]">
        {tab === "changes" && <Changes events={events} />}
        {tab === "wave" && <ScanTable rows={data.wave} empty="No liquid security's preferred count is in wave 3 right now." />}
        {tab === "fib" && <Fib rows={data.fib} />}
        {tab === "invalidation" && <ScanTable rows={data.invalidation} empty="No liquid security is within 3% of its count's invalidation level." inv />}
        {tab === "mtf" && <Aligned rows={data.aligned} />}
      </div>
      <div className="src">
        <span><b>Scope</b>Securities trading $25M+ a day{day ? `, session of ${day}` : ""}.</span>
        {tab === "changes" && <span><b>Method</b>{EVENTS_METHOD}</span>}
        {tab === "fib" && <span><b>Method</b>Zones where three or more Fibonacci relationships from the ranked counts overlap, within 3% of the last close.</span>}
        {tab === "mtf" && <span><b>Method</b>Daily and weekly preferred counts expect the same direction; ordered by the two confidences combined.</span>}
      </div>
    </section>
  );
}

function Changes({ events }: { events: StructureEvent[] }) {
  if (!events.length) return <Empty text="No structural events yet. Events compare each session with the previous one, so they begin after the next analysed session." />;
  return (
    <ul className="divide-y divide-line">
      {events.slice(0, 12).map((e, i) => (
        <li key={`${e.symbol}-${e.type}-${i}`} className="flex items-baseline gap-3 px-4 py-1.5 text-[13px]">
          <span className="mt-[5px] h-1.5 w-1.5 shrink-0 self-start rounded-full" style={{ background: TONE[eventTone(e)] }} aria-hidden />
          <TickerButton symbol={e.symbol} className="tk w-14 shrink-0 hover:text-brand" />
          <span className="w-[150px] shrink-0 text-[11.5px] font-[560] uppercase tracking-[0.03em] text-fg-3">{EVENT_LABEL[e.type]}</span>
          <span className="min-w-0 flex-1 truncate text-fg-2" title={eventSentence(e)}>{eventSentence(e)}</span>
          <span className={`num w-16 shrink-0 text-right text-[12.5px] ${(e.change_pct ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>{fmtPct(e.change_pct)}</span>
        </li>
      ))}
    </ul>
  );
}

function ScanTable({ rows, empty, inv = false }: { rows: ScanRow[]; empty: string; inv?: boolean }) {
  if (!rows.length) return <Empty text={empty} />;
  return (
    <table className="t dense text-[13px]">
      <thead><tr><th>Ticker</th><th className="hidden md:table-cell">Name</th><th>Preferred count</th><th className="r">Conf.</th><th className="r">{inv ? "To invalidation" : "To nearest zone"}</th><th className="r">Close</th><th className="r">Day</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.symbol}>
            <td><TickerButton symbol={r.symbol} className="tk hover:text-brand" /></td>
            <td className="hidden max-w-[220px] truncate text-fg-2 md:table-cell">{r.name}</td>
            <td>{waveShort(r.glance_pattern, r.glance_complete, r.glance_wave, r.glance_wave_dir) ?? "—"}</td>
            <td className="r num">{r.glance_score ?? "—"}</td>
            <td className="r num text-fg-2">{inv ? (r.hold_dist != null ? `${(r.hold_dist * 100).toFixed(1)}%` : "—") : (r.zone_dist != null ? `${(r.zone_dist * 100).toFixed(1)}%` : "—")}</td>
            <td className="r num">{fmtPrice(r.close)}</td>
            <td className={`r num ${(r.change_pct ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>{fmtPct(r.change_pct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Fib({ rows }: { rows: FibRow[] }) {
  if (!rows.length) return <Empty text="No liquid security has a zone of three or more relationships within 3% of price." />;
  return (
    <table className="t dense text-[13px]">
      <thead><tr><th>Ticker</th><th className="r">Zone</th><th className="r">Distance</th><th className="r" title="Fibonacci relationships overlapping in the zone">Relationships</th><th className="hidden md:table-cell">Degrees</th><th className="r">Strength</th><th className="r">Close</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.symbol}>
            <td><TickerButton symbol={r.symbol} className="tk hover:text-brand" /></td>
            <td className="r num">{fmtPrice(r.low)}–{fmtPrice(r.high)}</td>
            <td className="r num text-fg-2">{r.side === "above" ? "+" : "−"}{Math.abs(r.distance_pct * 100).toFixed(1)}%</td>
            <td className="r num">{r.relationships}</td>
            <td className="hidden text-fg-2 md:table-cell">{(r.degrees ?? []).join(", ")}</td>
            <td className="r num">{r.strength.toFixed(1)}</td>
            <td className="r num">{fmtPrice(r.close)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Aligned({ rows }: { rows: AlignRow[] }) {
  if (!rows.length) return <Empty text="No liquid security has daily and weekly counts pointing the same way." />;
  return (
    <table className="t dense text-[13px]">
      <thead><tr><th>Ticker</th><th>Direction</th><th>Daily count</th><th className="r">Conf.</th><th>Weekly count</th><th className="r">Conf.</th><th className="r">Day</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.symbol}>
            <td><TickerButton symbol={r.symbol} className="tk hover:text-brand" /></td>
            <td className={r.dir === "up" ? "text-pos" : "text-neg"}>{r.dir === "up" ? "Both up" : "Both down"}</td>
            <td>{waveShort(r.d_pattern, r.d_complete, r.d_wave, r.dir) ?? "—"}</td>
            <td className="r num">{r.d_score ?? "—"}</td>
            <td>{waveShort(r.w_pattern, r.w_complete, r.w_wave, r.dir) ?? "—"}</td>
            <td className="r num">{r.w_score ?? "—"}</td>
            <td className={`r num ${(r.change_pct ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>{fmtPct(r.change_pct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const Empty = ({ text }: { text: string }) => <p className="px-4 py-8 text-center text-[13px] text-fg-3">{text}</p>;
