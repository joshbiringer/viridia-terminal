import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/supabase";
import { exchangeLabel, fmtDateTime, stockHref } from "@/lib/format";
import { fmtPrice } from "@/lib/market-data/bars";
import { fmtDollars } from "@/lib/market-data/snapshot";
import { DEGREE_LABEL } from "@/lib/analysis/pivots";
import { FIB_METHOD } from "@/lib/analysis/candidates";
import { SourceFooter } from "@/components/SourceFooter";

export const metadata: Metadata = { title: "Fibonacci" };
export const dynamic = "force-dynamic";

type Row = {
  symbol: string; name: string; exchange: string; close: number; low: number; high: number; mid: number;
  strength: number; relationships: number; degrees: ("minor" | "intermediate" | "primary")[]; side: "above" | "below";
  distance_pct: number; adv20: number | null; analysis_timestamp: string;
};

const DIST = [["0.01", "Within 1%"], ["0.03", "Within 3%"], ["0.05", "Within 5%"]] as const;
const DV = [["", "Any"], ["5000000", "$5M+"], ["25000000", "$25M+"], ["100000000", "$100M+"]] as const;
const SIDE = [["", "Above or below"], ["below", "Support (below)"], ["above", "Resistance (above)"]] as const;

/** The relationships the engine measures. Mirrors candidateTargets() and swingLevels() in engine/fib.ts. */
const RELATIONSHIPS: [string, string, string, string][] = [
  ["Wave 2", "38.2%, 50%, 61.8%, 78.6% retracement of wave 1 (61.8% most common)", "Retracement of the latest swing", "Basics"],
  ["Wave 3", "100%, 161.8%, 261.8% of wave 1, projected from the end of wave 2", "Projection", "EWF"],
  ["Wave 4", "23.6%, 38.2%, 50% retracement of wave 3", "Retracement", "EWF"],
  ["Wave 4", "Near the prior fourth wave of one lesser degree", "Prior fourth", "Essentials"],
  ["Wave 4", "Channel: line through waves 1 and 3, parallel through wave 2 (arithmetic and log)", "Channel", "EWP"],
  ["Wave 5", "61.8%, 100%, 161.8% of wave 1, projected from the end of wave 4", "Projection", "Essentials"],
  ["Wave 5", "61.8% or 161.8% of the net length of waves 1–3", "Projection", "Essentials"],
  ["Wave 5", "Channel: line through waves 2 and 4, parallel through wave 3 (arithmetic and log)", "Channel", "Essentials"],
  ["After a five-wave move", "38.2%, 50%, 61.8% retracement of waves 1–5, and the end of wave 4", "Retracement, prior fourth", "Basics, Essentials"],
  ["Zigzag wave C", "61.8%, 100%, 123.6%, 161.8% of wave A (equality and 161.8% most common)", "Projection", "Essentials, EWF"],
  ["Flat wave C", "100%, 123.6%, 161.8% of wave A (161.8% typical of expanded flats)", "Projection", "Essentials"],
  ["Triangle legs", "61.8% or 78.6% of the prior leg; alternate legs related by 61.8%", "Projection", "EWF, Essentials"],
  ["After a triangle", "Thrust roughly the width of wave A", "Projection", "EWP"],
];

export default async function FibonacciPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const pick = <T extends readonly (readonly [string, string])[]>(opts: T, v?: string, d = opts[0][0]) => (opts.some(([k]) => k === v) ? v! : d);
  const dist = pick(DIST, sp.dist, "0.03"), dv = pick(DV, sp.dv), side = pick(SIDE, sp.side);
  const { data, error } = await db().rpc("fib_zone_scan", {
    p_max_distance: Number(dist), p_min_count: 2, p_min_dollar_volume: dv ? Number(dv) : null, p_side: side || null, p_limit: 60,
  });
  const rows = (data ?? []) as Row[];
  const newest = rows.reduce<string | null>((m, r) => (!m || r.analysis_timestamp > m ? r.analysis_timestamp : m), null);

  return (
    <>
      <section className="max-w-[760px] pt-2">
        <h1 className="h2">Fibonacci confluence.</h1>
        <p className="lede mt-3">
          Price bands where independent Fibonacci relationships from rule-valid wave counts, Elliott channels and recent swings
          coincide. Every level is anchored to confirmed pivots, never to hand-picked highs and lows.
        </p>
      </section>

      <section className="card">
        <form action="/analysis/fibonacci" className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-4">
          <Select name="dist" label="Distance from close" value={dist} options={DIST} />
          <Select name="side" label="Zone" value={side} options={SIDE} />
          <Select name="dv" label="Dollar volume" value={dv} options={DV} />
          <button type="submit" className="btn pri">Apply</button>
        </form>
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
          <span className="num font-medium">{rows.length} securities</span>
          <span className="text-fg-3">strongest daily zone per security, strongest first</span>
        </div>
        {error ? (
          <p className="px-5 py-10 text-center text-fg-2">Could not load zones: {error.message}</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-fg-2">No securities have a qualifying zone this close to price. Widen the distance, or check back after the analysis cache refreshes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13.5px]">
              <thead>
                <tr className="border-y border-line text-left text-[12px] text-fg-3">
                  <th className="px-5 py-2.5 font-medium">Security</th>
                  <th className="px-3 py-2.5 text-right font-medium">Close</th>
                  <th className="px-3 py-2.5 text-right font-medium">Zone</th>
                  <th className="px-3 py-2.5 text-right font-medium">Distance</th>
                  <th className="px-3 py-2.5 text-right font-medium">Relationships</th>
                  <th className="px-3 py-2.5 font-medium">Degrees</th>
                  <th className="px-3 py-2.5 text-right font-medium">Strength</th>
                  <th className="px-5 py-2.5 text-right font-medium">Dollar vol, 20d</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.symbol} className="hover:bg-hover">
                    <td className="px-5 py-2.5">
                      <Link href={stockHref(r.symbol)} className="flex items-baseline gap-2.5">
                        <span className="tk w-14">{r.symbol}</span>
                        <span className="max-w-[260px] truncate text-fg-2">{r.name}</span>
                        <span className="text-[12px] text-fg-3">{exchangeLabel(r.exchange)}</span>
                      </Link>
                    </td>
                    <td className="num px-3 py-2.5 text-right">{fmtPrice(r.close)}</td>
                    <td className="num px-3 py-2.5 text-right">{fmtPrice(r.low)}{r.high - r.low > 1e-9 ? `–${fmtPrice(r.high)}` : ""}</td>
                    <td className={`num px-3 py-2.5 text-right ${r.side === "above" ? "text-pos" : "text-neg"}`}>
                      {r.distance_pct >= 0 ? "+" : "−"}{Math.abs(r.distance_pct * 100).toFixed(1)}%
                    </td>
                    <td className="num px-3 py-2.5 text-right">{r.relationships}</td>
                    <td className="px-3 py-2.5 text-fg-2">{r.degrees.map((d) => DEGREE_LABEL[d]).join(", ")}</td>
                    <td className="num px-3 py-2.5 text-right font-medium">{r.strength}</td>
                    <td className="num px-5 py-2.5 text-right text-fg-2">{fmtDollars(r.adv20)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <SourceFooter source="Viridia engine on stored Massive daily bars" updated={fmtDateTime(newest)} method={FIB_METHOD} />
      </section>

      <section className="card">
        <div className="card-h"><h2 className="card-t">Relationships the engine measures</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-fg-3">
                <th className="px-5 py-2.5 font-medium">Wave</th><th className="px-3 py-2.5 font-medium">Relationship</th>
                <th className="px-3 py-2.5 font-medium">Kind</th><th className="px-5 py-2.5 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {RELATIONSHIPS.map(([w, rel, kind, src], i) => (
                <tr key={i}><td className="px-5 py-2.5 font-medium">{w}</td><td className="px-3 py-2.5 text-fg-2">{rel}</td><td className="px-3 py-2.5 text-fg-2">{kind}</td><td className="px-5 py-2.5 text-fg-3">{src}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-4 text-[12.5px] leading-relaxed text-fg-3">
          Targets a hard rule forbids are dropped (for example, a wave 4 level inside wave 1&apos;s territory). Levels price has already
          traded through are not used for zones. Sources: Prechter, <i>Learn the Essentials of the Elliott Wave Principle</i>; EWI,
          <i> Basics of the Elliott Wave Principle</i>; Frost &amp; Prechter, <i>Elliott Wave Principle</i> (EWP); Elliott Wave Forecast (EWF).
          See the <Link href="/analysis/rulebook" className="text-brand hover:underline">rulebook</Link> for the hard rules.
        </p>
      </section>
    </>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: readonly (readonly [string, string])[] }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <select name={name} defaultValue={value} className="field">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
