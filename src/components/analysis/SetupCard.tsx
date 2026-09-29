"use client";

import Link from "next/link";
import { fmtPrice } from "@/lib/market-data/bars";
import { pct } from "@/lib/market-data/snapshot";
import { DEGREES, DEGREE_LABEL, type Degree } from "@/lib/analysis/pivots";
import { BAND_LABEL, SETUP_LABEL, SETUP_METHOD, type SetupReasons, type Setups } from "@/lib/analysis/candidates";
import { SETUP_STORY, entryText } from "@/lib/analysis/setups";
import { useDegree } from "./DegreeContext";
import { SideChip } from "./SideChip";

const dist = (price: number, close: number | null) => (close ? price / close - 1 : null);

/**
 * The buy or sell setup the preferred count implies at the page's degree: entry, stop, target and
 * reward:risk, all taken from the count. Shows nothing invented when the count defines no setup.
 */
export interface KindStat { kind: string; side: string; resolved: number; hit_rate: number | null; avg_r: number | null }
export interface KindGrade { kind: string; side: string; grade: string; r_early: number | null; r_late: number | null }

export function SetupCard({ setups, reasons, close, record, quality }: { setups: Setups | null; reasons?: SetupReasons | null; close: number | null; record?: KindStat[] | null; quality?: KindGrade[] | null }) {
  const { degree, setDegree } = useDegree("intermediate");
  const s = setups?.[degree] ?? null;
  const others = DEGREES.filter((d) => d !== degree && setups?.[d]);

  return (
    <section className="card" aria-labelledby="setup-title">
      <div className="card-h">
        <div>
          <h2 id="setup-title" className="card-t">Wave setup</h2>
          <p className="card-s mt-0.5">{DEGREE_LABEL[degree]} degree · from the preferred count</p>
        </div>
        {s && <div className="ml-auto flex items-center gap-2"><SideChip side={s.side} /><span className="chip">{s.status === "active" ? "Active now" : "Waiting for entry"}</span></div>}
      </div>

      {!s ? (
        <div className="px-5 py-5">
          <p className="text-[14px] font-medium">No setup at {DEGREE_LABEL[degree].toLowerCase()} degree right now</p>
          <p className="mt-1 max-w-[680px] text-[13px] leading-relaxed text-fg-2">
            {reasons?.[degree] ?? "A setup needs the preferred count to define a stop and a target on the right sides of the entry."}{" "}
            Viridia shows nothing rather than a guess.
          </p>
          {others.length > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-fg-2">
              Setups at other degrees:
              {others.map((d) => (
                <button key={d} className="btn sm" onClick={() => setDegree(d as Degree)}>
                  {DEGREE_LABEL[d]} · {setups![d]!.side === "buy" ? "Buy" : "Sell"}
                </button>
              ))}
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-px bg-line md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="flex flex-col gap-2 bg-panel px-5 py-5">
            <div className="text-[18px] font-[620] leading-snug tracking-[-0.02em]">{SETUP_LABEL[s.kind]}</div>
            <p className="text-[13px] leading-relaxed text-fg-2">{SETUP_STORY[s.kind]}</p>
            <p className="mt-auto text-[12.5px] text-fg-3">
              Pattern Confidence <b className="num font-semibold text-fg">{s.score}</b> · {BAND_LABEL[s.band]}
            </p>
          </div>
          <div className="flex flex-col gap-3.5 bg-panel px-5 py-5">
            <Row name="Entry" value={entryText(s)} d={dist((s.entry.low + s.entry.high) / 2, close)} note={s.entry.zoneCount ? `${s.entry.basis} (${s.entry.zoneCount} relationships)` : s.entry.basis} />
            <Row name="Stop" value={fmtPrice(s.stop.price)} d={dist(s.stop.price, close)} note={s.stop.rule ? `${s.stop.basis} (hard rule)` : s.stop.basis} tone="neg" />
            <Row name="Target" value={fmtPrice(s.target.price)} d={dist(s.target.price, close)} note={s.target.basis} tone="pos" />
          </div>
          <div className="flex flex-col gap-3 bg-panel px-5 py-5">
            <div>
              <div className="text-[12.5px] text-fg-3">Reward : risk</div>
              <div className="num text-[26px] font-[650] tracking-[-0.02em]">{s.rr.toFixed(1)}<span className="text-[15px] text-fg-3"> : 1</span></div>
              <p className="text-[12px] text-fg-3">Risk to the stop: {pct(s.riskPct, 1).replace("+", "")} of the entry price</p>
            </div>
            <TrackLine stat={record?.find((r) => r.kind === s.kind && r.side === s.side) ?? null} grade={quality?.find((q) => q.kind === s.kind && q.side === s.side) ?? null} />
            {s.cautions.length > 0 && (
              <ul className="flex flex-col gap-1.5 text-[12.5px] leading-snug">
                {s.cautions.map((c) => <li key={c} className="flex gap-2 text-fg-2"><span className="text-[var(--warn)]" aria-hidden>!</span><span>{c}</span></li>)}
              </ul>
            )}
          </div>
        </div>
      )}
      <div className="src"><span><b>Method</b>{SETUP_METHOD}</span></div>
    </section>
  );
}

function Row({ name, value, d, note, tone }: { name: string; value: string; d: number | null; note: string; tone?: "pos" | "neg" }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 text-[12.5px]">
        <span className="text-fg-3">{name}</span>
        {d != null && <span className="num ml-auto text-fg-3">{pct(d, 1)} from close</span>}
      </div>
      <div className="num mt-0.5 text-[16px] font-[620] tracking-[-0.015em]" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</div>
      <p className="text-[12px] leading-snug text-fg-3">{note}</p>
    </div>
  );
}

/** How this kind of setup has done historically (engine backtest), or a note that the sample is small. */
function TrackLine({ stat, grade }: { stat: KindStat | null; grade?: KindGrade | null }) {
  if (!stat || stat.resolved === 0) {
    return <p className="text-[12px] leading-snug text-fg-3">Track record: not enough replayed history for this setup yet. <Link href="/setups/track-record" className="text-brand hover:underline">Track record</Link></p>;
  }
  const r = stat.avg_r ?? 0;
  return (
    <p className="text-[12px] leading-snug text-fg-2">
      <b className="font-medium text-fg">Track record:</b> this setup reached its target first in{" "}
      <b className="num">{((stat.hit_rate ?? 0) * 100).toFixed(0)}%</b> of {stat.resolved.toLocaleString("en-US")} past cases, averaging{" "}
      <b className={`num ${r >= 0 ? "text-pos" : "text-neg"}`}>{r >= 0 ? "+" : "−"}{Math.abs(r).toFixed(2)}R</b>.
      {stat.resolved < 30 && " Small sample."}
      {grade?.grade === "negative" && grade.r_early != null && grade.r_late != null && (
        <span style={{ color: "var(--warn)" }}> It lost money in both halves of the replay ({rTxt(grade.r_early)}, then {rTxt(grade.r_late)}), so treat it with caution.</span>
      )}
      {grade?.grade === "positive" && grade.r_early != null && grade.r_late != null && <> It made money in both halves of the replay ({rTxt(grade.r_early)}, then {rTxt(grade.r_late)}).</>}{" "}
      <Link href="/setups/track-record" className="text-brand hover:underline">Method</Link>
    </p>
  );
}

const rTxt = (r: number) => `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(2)}R`;
