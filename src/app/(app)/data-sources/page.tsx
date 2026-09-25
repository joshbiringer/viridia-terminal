import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/supabase";
import type { SyncRun } from "@/lib/types";
import { exchangeLabel, fmtDateTime, fmtInt, stockHref, timeAgo } from "@/lib/format";
import { SourceFooter } from "@/components/SourceFooter";
import { PIVOT_METHOD } from "@/lib/analysis/pivots";
import { ANALYSIS_VERSION, CANDIDATE_METHOD } from "@/lib/analysis/candidates";

export const metadata: Metadata = { title: "Data Sources" };
export const dynamic = "force-dynamic"; // always show the latest sync state

type SummaryRow = { exchange: string | null; asset_type: string; asset_subtype: string; active: number; inactive: number };
type MarketStatus = {
  sessions_open: number; sessions_closed: number; first_session: string | null; last_session: string | null; floor: string;
  bars_estimate: number; coverage_full: number; coverage_on_demand: number;
  universe: { ready: boolean; full?: number; qualified?: number; max_full?: number; refreshed_at?: string };
  jobs: Record<string, number>; calls_last_hour: number; db_bytes: number;
  worker_last_run: { finished_at?: string; error?: string; stopped?: string } | null;
};
type EventRow = { id: number; event_type: string; old_value: string | null; new_value: string | null; effective_at: string; securities: { symbol: string; name: string } | null };

const PHASES: [string, string, "live" | "next" | "planned"][] = [
  ["1", "Security master and universal search", "live"],
  ["2", "Historical market data ingestion and cache", "live"],
  ["3", "Adaptive pivot detection", "live"],
  ["4", "Elliott Wave hard-rule validation", "live"],
  ["5", "Candidate count generation", "live"],
  ["6", "Fibonacci engine and confluence zones", "next"],
  ["7", "Preferred and alternate count ranking", "planned"],
  ["8", "Interactive chart overlays", "planned"],
  ["9", "Multi-timeframe analysis", "planned"],
  ["10", "Market-wide Elliott Wave scanner", "planned"],
  ["11", "Historical backtesting framework", "planned"],
];

function nextScheduledSync(now = new Date()): Date {
  // pg_cron: 12:00 UTC, Monday–Saturday
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
  if (d <= now) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export default async function DataSourcesPage() {
  const sb = db();
  const [summary, lastRun, events, cik, mdRes, anRes] = await Promise.all([
    sb.from("universe_summary").select("*"),
    sb.from("sync_runs").select("*").eq("job", "security_master").order("id", { ascending: false }).limit(1).maybeSingle(),
    sb.from("security_events").select("id, event_type, old_value, new_value, effective_at, securities(symbol, name)").order("id", { ascending: false }).limit(12),
    sb.from("securities").select("id", { count: "exact", head: true }).eq("is_active", true).not("cik", "is", null),
    sb.rpc("market_data_status"),
    sb.rpc("analysis_status"),
  ]);
  const md = (mdRes.data ?? null) as MarketStatus | null;
  if (summary.error) throw new Error(summary.error.message);

  const rows = (summary.data ?? []) as SummaryRow[];
  const total = rows.reduce((s, r) => s + Number(r.active), 0);
  const bySub = (k: string) => rows.filter((r) => r.asset_subtype === k).reduce((s, r) => s + Number(r.active), 0);
  const exchanges = Object.entries(
    rows.reduce<Record<string, { common: number; etf: number; other: number; total: number }>>((acc, r) => {
      const k = r.exchange ?? "—";
      acc[k] ??= { common: 0, etf: 0, other: 0, total: 0 };
      const n = Number(r.active);
      if (r.asset_subtype === "common") acc[k].common += n; else if (r.asset_subtype === "etf") acc[k].etf += n; else acc[k].other += n;
      acc[k].total += n;
      return acc;
    }, {}),
  ).filter(([, v]) => v.total > 0).sort((a, b) => b[1].total - a[1].total);
  const maxEx = Math.max(1, ...exchanges.map(([, v]) => v.total));
  const run = lastRun.data as SyncRun | null;
  const evts = (events.data ?? []) as unknown as EventRow[];
  const stat = (k: string) => (run?.stats?.[k] as number | undefined) ?? 0;

  const cards = [
    ["Active securities", total, "Every NYSE, NASDAQ, NYSE American, NYSE Arca and Cboe listing"],
    ["Common stocks", bySub("common"), "Including ADRs and partnership units"],
    ["ETFs", bySub("etf"), "Exchange-traded funds and products"],
    ["Matched to SEC CIK", cik.count ?? 0, "Links each company to its EDGAR filings"],
  ] as const;

  return (
    <>
      <section className="pt-2">
        <h1 className="h2">Data sources</h1>
        <p className="lede mt-2 max-w-[720px]">Where every number in Viridia comes from, when it last updated, and what is still loading.</p>
      </section>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line bg-line lg:grid-cols-4">
        {cards.map(([k, v, s]) => (
          <div key={k} className="bg-panel px-5 py-4">
            <div className="text-[13px] text-fg-2">{k}</div>
            <div className="num mt-1 text-[24px] font-[600] tracking-[-0.02em]">{fmtInt(v)}</div>
            <div className="mt-0.5 text-[12.5px] text-fg-3">{s}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card">
          <div className="card-h"><span className="card-t">Universe by exchange</span><span className="card-s">Active listings</span>
            <Link href="/markets/stocks" className="btn sm ml-auto">Browse</Link></div>
          <div className="overflow-x-auto">
            <table className="t">
              <thead><tr><th>Exchange</th><th className="r">Common</th><th className="r">ETFs</th><th className="r">Other</th><th className="r">Total</th><th className="w-[35%]"></th></tr></thead>
              <tbody>
                {exchanges.map(([ex, v]) => (
                  <tr key={ex}>
                    <td><Link className="hover:text-brand" href={`/markets/${ex === "ARCX" || ex === "BATS" ? "etfs" : "stocks"}?exchange=${encodeURIComponent(ex)}`}>{exchangeLabel(ex)}</Link></td>
                    <td className="r num">{fmtInt(v.common)}</td><td className="r num">{fmtInt(v.etf)}</td>
                    <td className="r num text-fg-2">{fmtInt(v.other)}</td><td className="r num font-medium">{fmtInt(v.total)}</td>
                    <td><div className="bar"><i style={{ width: `${(v.total / maxEx) * 100}%` }} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SourceFooter source="Nasdaq Trader symbol directory" updated={fmtDateTime(run?.finished_at)} method="Active rows grouped by listing exchange" />
        </section>

        <section className="card flex flex-col">
          <div className="card-h"><span className="card-t">Security master sync</span>
            {run && <span className={`chip ${run.status === "succeeded" ? "pos" : run.status === "running" ? "acc" : "neg"}`}>{run.status}</span>}</div>
          <div className="flex-1 px-5 py-4">
            {run ? (
              <dl className="kv">
                <dt>Last run</dt><dd>{fmtDateTime(run.finished_at ?? run.started_at)} <span className="text-fg-3">({timeAgo(run.finished_at ?? run.started_at)})</span></dd>
                <dt>Downloaded</dt><dd className="num">{fmtInt(stat("downloaded"))}</dd>
                <dt>New listings</dt><dd className="num">{run.stats?.first_run ? "Initial load" : fmtInt(stat("listed"))}</dd>
                <dt>Renamed</dt><dd className="num">{fmtInt(stat("renamed"))}</dd>
                <dt>Exchange moves</dt><dd className="num">{fmtInt(stat("exchange_changes"))}</dd>
                <dt>Delisted</dt><dd className="num">{fmtInt(stat("delisted"))}</dd>
                <dt>Next run</dt><dd>{fmtDateTime(nextScheduledSync().toISOString())}</dd>
                {run.error && (<><dt>Error</dt><dd className="text-neg">{run.error}</dd></>)}
              </dl>
            ) : <p className="text-fg-2">No sync has run yet.</p>}
          </div>
          <SourceFooter source="sync_runs" updated={fmtDateTime(run?.finished_at)} method="Scheduled Mon–Sat 12:00 UTC by pg_cron" />
        </section>
      </div>

      {md && <MarketDataCard md={md} />}
      {anRes.data && <AnalysisCard a={anRes.data as AnalysisStatus} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card">
          <div className="card-h"><span className="card-t">Recent listing changes</span><span className="card-s">New listings, renames, exchange moves, delistings</span></div>
          {evts.length ? (
            <div className="overflow-x-auto"><table className="t">
              <thead><tr><th>Date</th><th>Symbol</th><th>Change</th><th>Detail</th></tr></thead>
              <tbody>{evts.map((e) => (
                <tr key={e.id}>
                  <td className="num text-fg-2">{e.effective_at}</td>
                  <td>{e.securities ? <Link className="tk hover:text-brand" href={stockHref(e.securities.symbol)}>{e.securities.symbol}</Link> : "—"}</td>
                  <td><span className={`chip ${e.event_type === "listed" ? "pos" : e.event_type === "delisted" ? "neg" : "acc"}`}>{e.event_type.replace("_", " ")}</span></td>
                  <td className="max-w-[420px] truncate text-fg-2">{e.old_value && e.new_value ? `${e.old_value} → ${e.new_value}` : e.securities?.name}</td>
                </tr>))}
              </tbody></table></div>
          ) : (
            <p className="px-5 py-10 text-center text-fg-2">No changes yet. The universe was loaded on {fmtDateTime(run?.finished_at)}; each daily sync records new listings, renames and delistings here.</p>
          )}
          <SourceFooter source="security_events" updated={fmtDateTime(run?.finished_at)} method="Diff of each daily snapshot against the stored universe" />
        </section>

        <section className="card">
          <div className="card-h"><span className="card-t">Build progress</span><span className="card-s">Phases of the Viridia engine</span></div>
          <ol className="px-5 py-2">
            {PHASES.map(([n, label, st]) => (
              <li key={n} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
                <span className="num w-5 text-fg-3">{n}</span>
                <span className="flex-1">{label}</span>
                <span className={`chip ${st === "live" ? "pos" : st === "next" ? "acc" : ""}`}>{st === "live" ? "Live" : st === "next" ? "Next" : "Planned"}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <p className="text-[11.5px] text-fg-3">Preferreds, warrants, units and rights are tracked too, but search ranks common stock, ETFs and indexes first.</p>
    </>
  );
}

function MarketDataCard({ md }: { md: MarketStatus }) {
  const day = 86_400_000;
  const floor = new Date(md.floor).getTime();
  const last = md.last_session ? new Date(md.last_session).getTime() : null;
  const first = md.first_session ? new Date(md.first_session).getTime() : null;
  const pct = first && last && last > floor ? Math.min(1, Math.max(0, (last - first) / (last - floor))) : 0;
  const done = pct >= 0.99;
  const pending = Object.entries(md.jobs).filter(([k]) => k.endsWith(":pending") || k.endsWith(":running")).reduce((a, [, n]) => a + n, 0);
  const failed = Object.entries(md.jobs).filter(([k]) => k.endsWith(":failed")).reduce((a, [, n]) => a + n, 0);
  const sessionsLeft = done ? 0 : Math.max(0, Math.round(((first ?? floor) - floor) / day * (5 / 7)));
  const minutesLeft = Math.ceil(sessionsLeft / 4);
  const dbMb = md.db_bytes / 1_048_576;
  const cells: [string, string, string][] = [
    ["Sessions stored", fmtInt(md.sessions_open), md.first_session ? `${md.first_session} to ${md.last_session}` : "Starting"],
    ["Daily bars", fmtInt(md.bars_estimate), "Split-adjusted, end of day"],
    ["Automatic coverage", md.universe.ready ? fmtInt(md.coverage_full) : "Measuring", md.universe.ready ? `Most liquid names, cap ${fmtInt(md.universe.max_full ?? 4000)}` : "Needs 20 sessions of volume"],
    ["On-demand coverage", fmtInt(md.coverage_on_demand), "Fetched the first time someone opens them"],
  ];
  return (
    <section className="card">
      <div className="card-h">
        <span className="card-t">Market data</span>
        <span className={`chip ${md.worker_last_run?.error ? "neg" : done ? "pos" : "acc"}`}>
          {md.worker_last_run?.error ? "Worker error" : done ? "Backfill complete" : "Backfilling"}
        </span>
        <span className="card-s ml-auto">Worker runs every minute, 4 Massive calls max</span>
      </div>
      <div className="grid grid-cols-2 gap-px border-b border-line bg-line lg:grid-cols-4">
        {cells.map(([k, v, s]) => (
          <div key={k} className="bg-panel px-5 py-4">
            <div className="text-[13px] text-fg-2">{k}</div>
            <div className="num mt-1 text-[20px] font-[600] tracking-[-0.02em]">{v}</div>
            <div className="mt-0.5 text-[12.5px] text-fg-3">{s}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          <span className="text-fg-2">Two-year backfill</span>
          <span className="num">{Math.round(pct * 100)}%</span>
          {!done && md.first_session && <span className="text-fg-3">about {minutesLeft < 90 ? `${minutesLeft} min` : `${(minutesLeft / 60).toFixed(1)} h`} left</span>}
          <span className="text-fg-3">Target {md.floor}</span>
          <span className="ml-auto text-fg-3">
            Queue <span className="num text-fg-2">{pending}</span>
            {failed > 0 && <> · failed today <span className="num text-neg">{failed}</span></>}
            {" · "}calls last hour <span className="num text-fg-2">{md.calls_last_hour}</span>
            {" · "}database <span className="num text-fg-2">{dbMb.toFixed(0)} MB</span> of 500
          </span>
        </div>
        <div className="bar"><i style={{ width: `${pct * 100}%` }} /></div>
        {md.worker_last_run?.error && <p className="text-[12px] text-neg">{md.worker_last_run.error}</p>}
      </div>
      <SourceFooter source="Massive grouped daily bars" updated={fmtDateTime(md.worker_last_run?.finished_at)} method="One call per session for the whole market; history for other names on demand" />
    </section>
  );
}

type AnalysisStatus = {
  securities_with_bars: number;
  timeframes: Record<string, { stored: number; current: number; version: string }>;
  last_run: { finished_at?: string; error?: string; ms?: number; "1d"?: number; "1w"?: number } | null;
};

function AnalysisCard({ a }: { a: AnalysisStatus }) {
  const tfs: [string, string][] = [["1d", "Daily"], ["1w", "Weekly"]];
  const run = a.last_run;
  return (
    <section className="card">
      <div className="card-h">
        <span className="card-t">Analysis cache</span>
        <span className={`chip ${run?.error ? "neg" : "pos"}`}>{run?.error ? "Worker error" : "Pivots and wave counts live"}</span>
        <span className="card-s ml-auto">Worker runs every 5 minutes · {ANALYSIS_VERSION}</span>
      </div>
      <div className="grid grid-cols-2 gap-px border-b border-line bg-line lg:grid-cols-4">
        {tfs.map(([k, label]) => {
          const t = a.timeframes[k];
          return (
            <div key={k} className="bg-panel px-5 py-4">
              <div className="text-[13px] text-fg-2">{label} analyses cached</div>
              <div className="num mt-1 text-[20px] font-[600] tracking-[-0.02em]">{fmtInt(t?.stored ?? 0)}</div>
              <div className="mt-0.5 text-[12.5px] text-fg-3">{fmtInt(t?.current ?? 0)} current with stored bars</div>
            </div>
          );
        })}
        <div className="bg-panel px-5 py-4">
          <div className="text-[13px] text-fg-2">Securities with bars</div>
          <div className="num mt-1 text-[20px] font-[600] tracking-[-0.02em]">{fmtInt(a.securities_with_bars)}</div>
          <div className="mt-0.5 text-[12.5px] text-fg-3">Each analyzed at 1D and 1W</div>
        </div>
        <div className="bg-panel px-5 py-4">
          <div className="text-[13px] text-fg-2">Last run</div>
          <div className="num mt-1 text-[20px] font-[600] tracking-[-0.02em]">{fmtInt((run?.["1d"] ?? 0) + (run?.["1w"] ?? 0))}</div>
          <div className="mt-0.5 text-[12.5px] text-fg-3">results in {((run?.ms ?? 0) / 1000).toFixed(1)} s, {timeAgo(run?.finished_at)}</div>
        </div>
      </div>
      <p className="px-5 py-4 text-[12.5px] leading-relaxed text-fg-3">
        A result is recomputed when new bars arrive, when the backfill adds older history, or when the algorithm version changes.
        While the backfill runs, most rows are refreshed every few minutes. 1H, 4H and 1M pivots are computed when a chart is opened. Each daily and weekly result includes the candidate wave counts at all three degrees.
        {run?.error && <span className="text-neg"> Last error: {run.error}</span>}
      </p>
      <SourceFooter source="Viridia engine on stored Massive bars" updated={fmtDateTime(run?.finished_at)} method={`${PIVOT_METHOD} ${CANDIDATE_METHOD}`} />
    </section>
  );
}
