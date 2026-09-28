import Link from "next/link";
import type { Metadata } from "next";
import { fmtInt } from "@/lib/format";
import { SETUP_LABEL } from "@/lib/analysis/candidates";
import { TRACK_METHOD, getBacktestCoverage, getTrackRecord, type KindRecord } from "@/lib/analysis/track-record";
import { PageHeader } from "@/components/ui/PageHeader";
import { SideChip } from "@/components/analysis/SideChip";

export const metadata: Metadata = { title: "Setup track record" };
export const dynamic = "force-dynamic";

const SCORES = [["", "Any confidence"], ["58", "Medium or higher (58+)"], ["70", "High (70+)"]] as const;
const RRS = [["", "Any reward:risk"], ["1.5", "1.5 : 1 or better"], ["2", "2 : 1 or better"]] as const;

const pctTxt = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(0)}%`);
const rTxt = (x: number | null) => (x == null ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(2)}R`);

export default async function TrackRecordPage({ searchParams }: { searchParams: Promise<{ score?: string; rr?: string }> }) {
  const sp = await searchParams;
  const score = SCORES.some(([k]) => k === sp.score) ? sp.score! : "";
  const rr = RRS.some(([k]) => k === sp.rr) ? sp.rr! : "";
  const [rows, cov] = await Promise.all([getTrackRecord(score ? Number(score) : null, rr ? Number(rr) : null), getBacktestCoverage()]);
  const all = rows.reduce(
    (a, r) => ({ resolved: a.resolved + r.resolved, targets: a.targets + r.targets, rSum: a.rSum + (r.avg_r ?? 0) * r.resolved, trials: a.trials + r.trials }),
    { resolved: 0, targets: 0, rSum: 0, trials: 0 },
  );
  const href = (p: Record<string, string>) => {
    const q = new URLSearchParams(Object.entries({ score, rr, ...p }).filter(([, v]) => v) as [string, string][]);
    return `/setups/track-record${q.size ? "?" + q : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Setup track record"
        description="What each kind of setup would have done if you had followed it: the engine replayed through history, one session at a time, with no look-ahead."
        actions={<Link href="/setups" className="btn">Current setups</Link>}
      />

      <section className="grid gap-px overflow-hidden rounded-[var(--r-lg)] border border-line bg-line sm:grid-cols-4">
        <Stat label="Resolved setups" value={fmtInt(all.resolved)} note={`${fmtInt(all.trials)} signals in total`} />
        <Stat label="Reached target first" value={pctTxt(all.resolved ? all.targets / all.resolved : null)} note="of resolved setups" />
        <Stat label="Average result" value={rTxt(all.resolved ? all.rSum / all.resolved : null)} note="per setup, in units of risk" />
        <Stat label="Securities replayed" value={cov ? `${fmtInt(cov.done)} of ${fmtInt(cov.total)}` : "—"} note="most-traded first; fills in over the day" />
      </section>

      <section className="card">
        <div className="card-h flex-wrap gap-3">
          <h2 className="card-t">By setup</h2>
          <nav className="ml-auto flex flex-wrap gap-2" aria-label="Filters">
            {SCORES.map(([k, v]) => <Link key={k} href={href({ score: k })} className={`btn sm ${score === k ? "pri" : ""}`}>{v}</Link>)}
            {RRS.slice(1).map(([k, v]) => <Link key={k} href={href({ rr: rr === k ? "" : k })} className={`btn sm ${rr === k ? "pri" : ""}`}>{v}</Link>)}
          </nav>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="t dense">
              <thead>
                <tr>
                  <th>Setup</th>
                  <th className="r">Resolved</th>
                  <th className="r" title="Target reached before the stop">Hit rate</th>
                  <th className="r" title="Average result per setup in multiples of the initial risk">Avg result</th>
                  <th className="r hidden sm:table-cell">Stopped</th>
                  <th className="r hidden sm:table-cell">Expired</th>
                  <th className="r hidden md:table-cell" title="Waiting setups whose entry never filled">Missed</th>
                  <th className="r hidden md:table-cell" title="Median sessions to the outcome">Median days</th>
                  <th className="r hidden lg:table-cell" title="Too recent to resolve">Pending</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => <Row key={`${r.kind}-${r.side}`} r={r} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-fg-2">The replay is still running. Results appear here as each security is processed, most-traded first.</p>
        )}
        <div className="src">
          <span><b>Method</b>{TRACK_METHOD}</span>
          <span><b>Reading it</b>A hit rate below 50% can still be profitable when winners are larger than losers; the average result shows which. Small samples (under about 30 resolved) are noise.</span>
        </div>
      </section>
    </>
  );
}

function Row({ r }: { r: KindRecord }) {
  const thin = r.resolved < 30;
  return (
    <tr>
      <td className="whitespace-nowrap">
        <span className="inline-flex items-center gap-2"><SideChip side={r.side} short /> {SETUP_LABEL[r.kind] ?? r.kind}</span>
        {thin && <span className="ml-2 text-[12px] text-fg-3">small sample</span>}
      </td>
      <td className="r num">{fmtInt(r.resolved)}</td>
      <td className="r num font-medium">{pctTxt(r.hit_rate)}</td>
      <td className={`r num font-medium ${r.avg_r == null ? "" : r.avg_r > 0 ? "text-pos" : "text-neg"}`}>{rTxt(r.avg_r)}</td>
      <td className="r num hidden text-fg-2 sm:table-cell">{fmtInt(r.stops)}</td>
      <td className="r num hidden text-fg-2 sm:table-cell">{fmtInt(r.expired)}</td>
      <td className="r num hidden text-fg-2 md:table-cell">{fmtInt(r.missed)}</td>
      <td className="r num hidden text-fg-2 md:table-cell">{r.median_bars ?? "—"}</td>
      <td className="r num hidden text-fg-3 lg:table-cell">{fmtInt(r.pending)}</td>
    </tr>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-panel px-5 py-4">
      <div className="text-[12.5px] text-fg-3">{label}</div>
      <div className="num mt-1 text-[22px] font-[650] tracking-[-0.02em]">{value}</div>
      <div className="text-[12px] text-fg-3">{note}</div>
    </div>
  );
}
