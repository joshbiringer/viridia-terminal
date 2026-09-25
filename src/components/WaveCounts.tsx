"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtPrice } from "@/lib/market-data/bars";
import { fmtDate } from "@/lib/format";
import { DEGREE_LABEL } from "@/lib/analysis/pivots";
import { CANDIDATE_METHOD, PATTERN_LABEL, type ClientCandidate, type ClientCandidates } from "@/lib/analysis/candidates";

type Degree = keyof ClientCandidates;
const ORDER: Degree[] = ["primary", "intermediate", "minor"];
const PREFERRED_TAB: Degree[] = ["intermediate", "minor", "primary"];

/**
 * Candidate wave counts (engine Phase 5). Every count shown passes every hard rule. They are listed by
 * how much of the recent structure they explain; which is preferred is decided by ranking in Phase 7.
 */
export function WaveCounts({ data, asOf, version, source }: { data: ClientCandidates | null; asOf?: string; version?: string; source?: string }) {
  const first = data ? PREFERRED_TAB.find((d) => data[d].candidates.length) ?? "intermediate" : "intermediate";
  const [deg, setDeg] = useState<Degree>(first);
  const [open, setOpen] = useState<string | null>(null);
  const set = data?.[deg];

  return (
    <div className="card">
      <div className="card-h">
        <h2 className="card-t">Candidate wave counts</h2>
        <span className="chip">Unranked</span>
        <div className="seg ml-auto" role="tablist" aria-label="Wave degree">
          {ORDER.map((d) => (
            <button key={d} role="tab" aria-selected={deg === d} onClick={() => { setDeg(d); setOpen(null); }}>
              {DEGREE_LABEL[d]}{data ? <span className="num text-fg-3">{data[d].candidates.length}{data[d].truncated ? "+" : ""}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {!data || !set ? (
        <p className="px-5 py-6 text-[13.5px] text-fg-3">Appears once daily bars are stored.</p>
      ) : (
        <div className="flex flex-col">
          <p className="border-b border-line px-5 py-3.5 text-[13px] leading-relaxed text-fg-2">
            {set.anchor ? (
              <>
                Counts ending at the latest {DEGREE_LABEL[deg].toLowerCase()} swing {set.anchor.type},{" "}
                <span className="num font-medium text-fg">{fmtPrice(set.anchor.price)}</span> on {fmtDate(set.anchor.ts)}.{" "}
                {set.examined.toLocaleString("en-US")} labelings tested, {set.eliminated.toLocaleString("en-US")} broke a hard rule,{" "}
                <b className="font-medium text-fg">{set.candidates.length}{set.truncated ? "+" : ""}</b> remain.
              </>
            ) : "Not enough confirmed swings at this degree yet."}
          </p>

          {set.candidates.length === 0 && set.anchor && (
            <p className="px-5 py-6 text-[13.5px] text-fg-2">
              No labeling of the recent {DEGREE_LABEL[deg].toLowerCase()} swings satisfies every rule. The structure is either still forming
              or is a combination, which is checked once lower-degree counts are reconciled (Phase 9).
            </p>
          )}

          <ul className="divide-y divide-line">
            {set.candidates.map((c) => (
              <CountRow key={c.id} c={c} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} />
            ))}
          </ul>

          {set.eliminatedBy.length > 0 && (
            <details className="border-t border-line px-5 py-3.5 text-[12.5px] text-fg-2">
              <summary className="cursor-pointer text-fg-3">Why labelings were eliminated</summary>
              <ul className="mt-2 flex flex-col gap-1.5">
                {set.eliminatedBy.map((e) => (
                  <li key={e.ruleId} className="flex gap-3"><span className="num w-12 shrink-0 text-right text-fg">{e.count.toLocaleString("en-US")}</span><span>{e.text}</span></li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      <div className="src">
        <span><b>Method</b> {CANDIDATE_METHOD} Rules: <Link href="/analysis/rulebook" className="text-brand hover:underline">rulebook</Link>.</span>
        {version && <span><b>Engine</b> {version}{source === "live" ? " (computed on load)" : ""}{asOf ? `, bars to ${fmtDate(asOf)}` : ""}</span>}
      </div>
    </div>
  );
}

function CountRow({ c, open, onToggle }: { c: ClientCandidate; open: boolean; onToggle: () => void }) {
  const done = c.points.slice(1).map((p) => p.label);
  const arrow = c.next.direction === "up" ? "↑" : "↓";
  const nextText = c.complete ? `Pattern complete; next move ${c.next.direction}` : `Wave ${c.next.label} in progress ${arrow}`;
  return (
    <li>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5 text-left hover:bg-hover">
        <span className={`dot ${c.direction === "up" ? "bg-pos" : "bg-neg"}`} aria-hidden />
        <span className="min-w-[150px] text-[14px] font-medium">
          {PATTERN_LABEL[c.pattern]}{c.subtype ? <span className="text-fg-3"> · {c.subtype.replace("_", " ")}</span> : null}
          <span className="text-fg-3"> {c.direction === "up" ? "up" : "down"}</span>
        </span>
        <span className="num text-[13px] text-fg-2">{done.join("-")} <span className="text-fg-3">from {fmtPrice(c.points[0].price)}, {fmtDate(c.points[0].ts)}</span></span>
        <span className="text-[13px] text-fg-2">{nextText}</span>
        <span className="num ml-auto text-[13px]">
          {c.invalidation != null ? <>Invalid past <b className="font-semibold">{fmtPrice(c.invalidation)}</b></> : <span className="text-fg-3">No rule level</span>}
        </span>
      </button>
      {open && (
        <div className="grid gap-4 bg-panel-2 px-5 py-4 text-[12.5px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <div className="label mb-1.5">Labeled points</div>
            <table className="num w-full">
              <tbody>
                {c.points.map((p) => (
                  <tr key={p.ts}><td className="w-10 py-0.5 font-semibold">{p.label === "0" ? "Start" : p.label}</td><td className="text-fg-2">{fmtDate(p.ts)}</td><td className="text-right">{fmtPrice(p.price)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <div className="label">Evidence (not a score)</div>
              <p className="mt-1 text-fg-2">
                {c.evidence.evaluated ? `${c.evidence.passed} of ${c.evidence.evaluated} guidelines met` : "No guidelines measurable yet"}
                {c.evidence.fibTotal ? `; ${c.evidence.fibMatches} of ${c.evidence.fibTotal} ratios near a Fibonacci value` : ""}.
              </p>
            </div>
            {c.next.hold != null && (
              <div>
                <div className="label">Must hold</div>
                <p className="mt-1 text-fg-2">
                  Price moving {c.next.holdSide} <b className="num text-fg">{fmtPrice(c.next.hold)}</b> breaks this count: {c.next.holdReason}.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
