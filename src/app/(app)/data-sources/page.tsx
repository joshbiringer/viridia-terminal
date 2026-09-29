import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/supabase";
import type { SyncRun } from "@/lib/types";
import { exchangeLabel, fmtDateTime, fmtInt, stockHref, timeAgo } from "@/lib/format";
import { SourceFooter } from "@/components/SourceFooter";
import { PIVOT_METHOD } from "@/lib/analysis/pivots";
import { ANALYSIS_VERSION, CANDIDATE_METHOD, FIB_METHOD } from "@/lib/analysis/candidates";
import { PageHeader } from "@/components/ui/PageHeader";

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

export default async function DataSourcesPage() {
  const sb = db();
  const [summary, lastRun, events, cik, mdRes, anRes, intRes] = await Promise.all([
    sb.from("universe_summary").select("*"),
    sb.from("sync_runs").select("*").eq("job", "security_master").order("id", { ascending: false }).limit(1).maybeSingle(),
    sb.from("security_events").select("id, event_type, old_value, new_value, effective_at, securities(symbol, name)").order("id", { ascending: false }).limit(12),
    sb.from("securities").select("id", { count: "exact", head: true }).eq("is_active", true).not("cik", "is", null),
    sb.rpc("market_data_status"),
    sb.rpc("analysis_status"),
    sb.rpc("integrity_summary"),
  ]);
  const integrity = (intRes.data ?? null) as { ran_at: string | null; checks: Record<string, number>; high: number } | null;
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
      <PageHeader title="Data and methodology" description="Where every number in Viridia comes from, how often it updates, how it's checked, and what isn't covered yet." />

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-lg)] border border-line bg-line lg:grid-cols-4">
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
          <div className="card-h"><span className="card-t">Listings</span></div>
          <div className="flex-1 px-5 py-4">
            <dl className="kv">
              <dt>Source</dt><dd>Nasdaq Trader symbol directories, matched to SEC company identifiers</dd>
              <dt>Updates</dt><dd>Every weekday and Saturday morning</dd>
              <dt>Last update</dt><dd>{run ? `${fmtDateTime(run.finished_at ?? run.started_at)} (${timeAgo(run.finished_at ?? run.started_at)})` : "—"}</dd>
              <dt>Last update found</dt><dd className="num">{run ? `${fmtInt(stat("listed"))} new, ${fmtInt(stat("renamed"))} renamed, ${fmtInt(stat("delisted"))} delisted` : "—"}</dd>
            </dl>
          </div>
          <SourceFooter source="Nasdaq Trader, SEC" updated={fmtDateTime(run?.finished_at)} method="Each update is compared with the stored universe; changes are recorded below" />
        </section>
      </div>

      {md && <MarketDataCard md={md} integrity={integrity} />}
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
          <SourceFooter source="Listing updates" updated={fmtDateTime(run?.finished_at)} method="Differences between each update and the stored universe" />
        </section>

        <section className="card">
          <div className="card-h"><span className="card-t">Coverage and limitations</span></div>
          <ul className="flex flex-col gap-2 px-5 py-4 text-[13px] leading-relaxed text-fg-2">
            <li><b className="font-medium text-fg">Prices</b> are end of day and split-adjusted. There are no intraday quotes.</li>
            <li><b className="font-medium text-fg">Indexes, yields and futures</b> aren&apos;t in the data plan, so markets appear through liquid ETFs that track them.</li>
            <li><b className="font-medium text-fg">Wave counts</b> cover single patterns at three degrees. Combination corrections aren&apos;t evaluated yet.</li>
            <li><b className="font-medium text-fg">Fundamentals</b> from SEC filings aren&apos;t loaded yet. Earnings and economic calendars aren&apos;t connected.</li>
            <li><b className="font-medium text-fg">Setup track record</b> replays about a year of history for each security, without costs or slippage.</li>
          </ul>
        </section>
      </div>
      <p className="text-[11.5px] text-fg-3">Preferreds, warrants, units and rights are tracked too, but search ranks common stock, ETFs and indexes first.</p>
    </>
  );
}

function MarketDataCard({ md, integrity }: { md: MarketStatus; integrity: { ran_at: string | null; checks: Record<string, number>; high: number } | null }) {
  const cells: [string, string, string][] = [
    ["Sessions stored", fmtInt(md.sessions_open), md.first_session ? `${md.first_session} to ${md.last_session}` : "—"],
    ["Daily bars", fmtInt(md.bars_estimate), "Split-adjusted, end of day"],
    ["Automatic coverage", md.universe.ready ? fmtInt(md.coverage_full) : "—", "The most-traded listings, updated after every session"],
    ["On-demand coverage", fmtInt(md.coverage_on_demand), "Fetched the first time a security is opened, then kept current"],
  ];
  const checks = Object.values(integrity?.checks ?? {}).reduce((a, n) => a + n, 0);
  return (
    <section className="card">
      <div className="card-h">
        <span className="card-t">Market data</span>
        <span className="card-s ml-auto">Latest session {md.last_session ?? "—"}</span>
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
      <p className="px-5 py-4 text-[12.5px] leading-relaxed text-fg-2">
        <b className="font-medium text-fg">Integrity checks.</b> Every weekday evening the recent history of every security is checked for malformed bars,
        split-like jumps that suggest unadjusted history, moves over 40%, opens and closes on different adjustment bases, stale prices, duplicate
        listings, ticker changes and corporate actions. Flagged items are reviewed before they can distort an analysis.
        {integrity?.ran_at && <> Last run {fmtDateTime(integrity.ran_at)}: {fmtInt(checks)} items flagged for review{integrity.high ? `, ${fmtInt(integrity.high)} high priority` : ""}.</>}
      </p>
      <SourceFooter source="Massive grouped daily bars" updated={md.last_session ?? "—"} method="The whole market in one request per session; other securities on demand" />
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
  return (
    <section className="card">
      <div className="card-h">
        <span className="card-t">Analysis</span>
        <span className="card-s ml-auto">Engine {ANALYSIS_VERSION}</span>
      </div>
      <div className="grid grid-cols-2 gap-px border-b border-line bg-line lg:grid-cols-3">
        {tfs.map(([k, label]) => {
          const t = a.timeframes[k];
          return (
            <div key={k} className="bg-panel px-5 py-4">
              <div className="text-[13px] text-fg-2">{label} analyses</div>
              <div className="num mt-1 text-[20px] font-[600] tracking-[-0.02em]">{fmtInt(t?.stored ?? 0)}</div>
              <div className="mt-0.5 text-[12.5px] text-fg-3">{fmtInt(t?.current ?? 0)} on the latest data</div>
            </div>
          );
        })}
        <div className="bg-panel px-5 py-4">
          <div className="text-[13px] text-fg-2">Securities analysed</div>
          <div className="num mt-1 text-[20px] font-[600] tracking-[-0.02em]">{fmtInt(a.securities_with_bars)}</div>
          <div className="mt-0.5 text-[12.5px] text-fg-3">Last update {timeAgo(a.last_run?.finished_at)}</div>
        </div>
      </div>
      <p className="px-5 py-4 text-[12.5px] leading-relaxed text-fg-2">
        Daily analyses are recomputed after every session; weekly analyses when a week completes. Each includes swing pivots at three degrees,
        every wave count that passes the hard rules, their ranking by Pattern Confidence, Fibonacci targets and confluence zones, and any setup the
        preferred count implies. Hourly and monthly pivots are computed when a chart is opened. Each session&apos;s analysis is compared with the previous
        one to record structural events.
      </p>
      <SourceFooter source="Viridia engine on stored Massive bars" updated={fmtDateTime(a.last_run?.finished_at)} method={`${PIVOT_METHOD} ${CANDIDATE_METHOD} ${FIB_METHOD}`} />
    </section>
  );
}
