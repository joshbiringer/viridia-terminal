import Link from "next/link";
import type { Metadata } from "next";
import { fmtInt } from "@/lib/format";
import { SETUP_LABEL } from "@/lib/analysis/candidates";
import { TRACK_METHOD, bucketTotals, daysSince, getBacktestCoverage, getBacktestFreshness, getScoreBuckets, getSetupQuality, getTrackRecord, type KindRecord } from "@/lib/analysis/track-record";
import { BACKTEST_VERSION } from "@engine/backtest";
import { GradeChip } from "@/components/analysis/GradeChip";
import { QUALITY_METHOD } from "@/lib/analysis/quality";
import { SETUP_LABEL as KIND_LABEL } from "@/lib/analysis/candidates";
import { PageHeader } from "@/components/ui/PageHeader";
import { SideChip } from "@/components/analysis/SideChip";

export const metadata: Metadata = { title: "Setup track record" };
export const dynamic = "force-dynamic";

const SCORES = [["", "Any score"], ["58", "Pattern Confidence 58+"], ["70", "Pattern Confidence 70+"]] as const;
const RRS = [["", "Any reward:risk"], ["1.5", "1.5 : 1 or better"], ["2", "2 : 1 or better"]] as const;

const pctTxt = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(0)}%`);
const dayTxt = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—");
const rTxt = (x: number | null) => (x == null ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(2)}R`);

export default async function TrackRecordPage({ searchParams }: { searchParams: Promise<{ score?: string; rr?: string }> }) {
  const sp = await searchParams;
  const score = SCORES.some(([k]) => k === sp.score) ? sp.score! : "";
  const rr = RRS.some(([k]) => k === sp.rr) ? sp.rr! : "";
  const [rows, cov, quality, fresh, buckets] = await Promise.all([
    getTrackRecord(score ? Number(score) : null, rr ? Number(rr) : null), getBacktestCoverage(), getSetupQuality().catch(() => []),
    getBacktestFreshness().catch(() => null), getScoreBuckets(rr ? Number(rr) : null).catch(() => null),
  ]);
  const side = (sd: "buy" | "sell") => rows.filter((r) => r.side === sd).reduce((a, r) => ({ n: a.n + r.resolved, rSum: a.rSum + (r.avg_r ?? 0) * r.resolved }), { n: 0, rSum: 0 });
  const bull = side("buy"), bear = side("sell");
  const lastRunDays = daysSince(fresh?.last_run ?? null);
  const stale = lastRunDays != null && lastRunDays > 7;
  const tiers = buckets ? bucketTotals(buckets) : [];
  const solid = tiers.filter((t) => t.resolved >= 100).sort((a, b) => a.bucket - b.bucket);
  const rises = solid.length >= 2 && solid.every((t, i) => i === 0 || (t.avgR ?? 0) >= (solid[i - 1].avgR ?? 0));
  const split = quality[0]?.split_date ?? null;
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
        description="A hypothetical replay of the Elliott Wave engine through stored daily history, one session at a time with no look-ahead. Results are gross of trading costs, cover only securities listed today, and span about one year of mostly rising markets. They are not trading results."
        actions={<Link href="/setups" className="btn">Current setups</Link>}
      />

      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-fg-2" aria-label="About this data">
        <div><dt className="inline text-fg-3">Strategy </dt><dd className="inline num">{BACKTEST_VERSION}</dd></div>
        {fresh && <div><dt className="inline text-fg-3">Signals </dt><dd className="inline">{dayTxt(fresh.first_signal)} to {dayTxt(fresh.last_signal)}</dd></div>}
        <div><dt className="inline text-fg-3">Securities replayed </dt><dd className="inline num">{cov ? `${fmtInt(cov.done)} of ${fmtInt(cov.total)}` : "—"}</dd></div>
        {fresh && <div><dt className="inline text-fg-3">Replay last ran </dt><dd className="inline" style={stale ? { color: "var(--warn)" } : undefined}>{dayTxt(fresh.last_run)}{lastRunDays != null ? ` (${lastRunDays} days ago${fresh.job_active ? "" : ", paused"})` : ""}</dd></div>}
        <div><dt className="inline text-fg-3">Status </dt><dd className="inline">Backtest only: no forward-tested or live trades</dd></div>
      </dl>

      <section className="grid gap-px overflow-hidden rounded-[var(--r-lg)] border border-line bg-line sm:grid-cols-4">
        <Stat label="Resolved setups" value={fmtInt(all.resolved)} note={`${fmtInt(all.trials)} signals in total${score ? `, Pattern Confidence ${score}+` : ""}`} />
        <Stat label="Average result, gross" value={rTxt(all.resolved ? all.rSum / all.resolved : null)} note={`per setup in units of risk; target first ${pctTxt(all.resolved ? all.targets / all.resolved : null)}`} />
        <Stat label="Bullish setups" value={rTxt(bull.n ? bull.rSum / bull.n : null)} note={`average of ${fmtInt(bull.n)} resolved`} />
        <Stat label="Bearish setups" value={rTxt(bear.n ? bear.rSum / bear.n : null)} note={`average of ${fmtInt(bear.n)} resolved`} />
      </section>

      {tiers.length > 0 && (
        <section className="card" aria-labelledby="score-t">
          <div className="card-h">
            <div>
              <h2 id="score-t" className="card-t">Does a higher score help?</h2>
              <p className="card-s mt-0.5">{solid.length < 2 ? "Too few resolved setups per score band to say." : rises ? "In this sample, average results rose with Pattern Confidence." : "Not in this sample: average results do not rise with Pattern Confidence, so a higher score is not a better setup here."} Bands do not overlap, and costs are not included.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="t dense">
              <thead><tr><th>Pattern Confidence</th><th className="r">Signals</th><th className="r">Resolved</th><th className="r" title="Structural target reached before the stop">Target first</th><th className="r" title="Resolved with any gain, including expiries marked to the close">Ended positive</th><th className="r">Avg result</th></tr></thead>
              <tbody>
                {tiers.map((t) => (
                  <tr key={t.bucket} className={score && t.bucket >= Number(score) ? "" : score ? "text-fg-3" : ""}>
                    <td className="num">{t.bucket === 40 ? "Under 50" : t.bucket === 90 ? "90+" : `${t.bucket}–${t.bucket + 9}`}{t.resolved < 100 && <span className="ml-2 text-[12px] text-fg-3">small sample</span>}</td>
                    <td className="r num">{fmtInt(t.trials)}</td>
                    <td className="r num">{fmtInt(t.resolved)}</td>
                    <td className="r num">{pctTxt(t.resolved ? t.targets / t.resolved : null)}</td>
                    <td className="r num">{pctTxt(t.resolved ? t.positive / t.resolved : null)}</td>
                    <td className={`r num font-medium ${t.avgR == null ? "" : t.avgR > 0 ? "text-pos" : "text-neg"}`}>{rTxt(t.avgR)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="src"><span><b>Pattern Confidence</b>The share of Elliott Wave guidelines the preferred count passes, round(100 × (passed + 2) ÷ (checked + 4)). It measures how textbook the count looks, not the odds of a profit, and it does not include RSI or MACD.</span></div>
        </section>
      )}

      {quality.length > 0 && (
        <section className="card">
          <div className="card-h">
            <div>
              <h2 className="card-t">Out of sample: does each kind hold up?</h2>
              <p className="card-s mt-0.5">Trials split at {split ? new Date(`${split}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "the median date"}; a kind earns a grade only when both halves agree</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="t dense">
              <thead><tr><th>Setup</th><th>Grade</th><th className="r">Resolved</th><th className="r">Avg result</th><th className="r">First half</th><th className="r">Second half</th></tr></thead>
              <tbody>
                {quality.map((q) => (
                  <tr key={`${q.kind}-${q.side}`}>
                    <td className="whitespace-nowrap"><span className={q.side === "buy" ? "text-pos" : "text-neg"}>{q.side === "buy" ? "Bullish" : "Bearish"}</span> · {KIND_LABEL[q.kind] ?? q.kind}</td>
                    <td><GradeChip grade={q.grade} avgR={q.avg_r} /></td>
                    <td className="r num">{fmtInt(q.n)}</td>
                    <td className="r num">{rTxt(q.avg_r)}</td>
                    <td className="r num text-fg-2">{rTxt(q.r_early)} <span className="text-fg-3">({fmtInt(q.n_early)})</span></td>
                    <td className="r num text-fg-2">{rTxt(q.r_late)} <span className="text-fg-3">({fmtInt(q.n_late)})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="src"><span><b>Grades</b>{QUALITY_METHOD}</span><span><b>Used for</b>The Setups screen ranks by this record by default and can leave negative kinds out; Mission Control leaves them out.</span></div>
        </section>
      )}

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
                  <th className="r" title="Structural target reached before the invalidation">Hit rate</th>
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
          <p className="px-5 py-10 text-center text-fg-2">No replayed setups match these filters.</p>
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
