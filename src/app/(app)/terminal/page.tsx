import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/supabase";
import { getBreadth, getOverview, scan } from "@/lib/market-data/snapshot";
import { greeting, marketState } from "@/lib/market-hours";
import { fmtDate, fmtInt } from "@/lib/format";
import { MarketStrip } from "@/components/MarketStrip";
import { BreadthSummary } from "@/components/BreadthSummary";
import { ScannerTable } from "@/components/ScannerTable";
import { SWING_LABEL, type SwingStructure } from "@/lib/analysis/pivots";
import { PageHeader } from "@/components/ui/PageHeader";
import { FirstRun } from "@/components/FirstRun";
import { getViewer } from "@/lib/auth";
import { authClient } from "@/lib/supabase/server";
import { countLabel } from "@/components/ScannerTable";
import { stockHref } from "@/lib/format";

const SWING_ORDER: [SwingStructure, string][] = [
  ["higher_highs_lows", "var(--pos-chart)"], ["expanding", "var(--alt)"], ["contracting", "var(--fib)"],
  ["lower_highs_lows", "var(--neg)"], ["insufficient", "var(--border-2)"],
];

export const metadata: Metadata = { title: "Terminal" };
export const dynamic = "force-dynamic";

type Status = { sessions_open: number; first_session: string | null; last_session: string | null; floor: string; coverage_full: number };

/** Structure presets shown on the home page, each linking to the scanner with that filter. */
const PRESETS: [string, string][] = [
  ["wave3", "Wave 3 in progress"], ["wave5", "Wave 5 in progress"], ["wave_c", "Wave C in progress"],
  ["abc_done", "Correction complete"], ["five_done", "Five waves complete"], ["near_invalidation", "Near invalidation"],
];
const LIQUID = 25_000_000; // $25M average daily dollar volume: setups a reader can actually trade

export default async function TerminalHome({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const viewer = await getViewer().catch(() => null);
  const watchedCount = viewer
    ? ((await (await authClient()).from("watchlist_items").select("security_id", { count: "exact", head: true })).count ?? 0)
    : 0;
  const showFirstRun = !viewer || watchedCount === 0 || (await searchParams).welcome === "1";
  const [overview, breadth, active, statusRes, swingRes, setups, ...presetRows] = await Promise.all([
    getOverview(), getBreadth(), scan({ p_sort: "dollar_volume", p_limit: 10 }), db().rpc("market_data_status"),
    db().rpc("swing_breadth", { p_timeframe: "1d", p_degree: "intermediate" }),
    scan({ p_sort: "confidence", p_limit: 8, p_min_score: 70, p_min_dollar_volume: LIQUID }).catch(() => []),
    ...PRESETS.map(([k]) => scan({ p_structure: k, p_limit: 1, p_min_dollar_volume: LIQUID }).catch(() => [])),
  ]);
  const presetCounts = PRESETS.map(([k, label], i) => ({ k, label, n: presetRows[i]?.[0]?.total ?? 0 }));
  const swingCounts = ((swingRes.data as { counts?: Record<string, number> } | null)?.counts ?? {}) as Partial<Record<SwingStructure, number>>;
  const swingTotal = Object.values(swingCounts).reduce((a, b) => a + (b ?? 0), 0);
  const st = (statusRes.data ?? null) as Status | null;
  const m = marketState();
  const floor = st ? new Date(st.floor).getTime() : 0;
  const last = st?.last_session ? new Date(st.last_session).getTime() : 0;
  const first = st?.first_session ? new Date(st.first_session).getTime() : 0;
  const backfill = last > floor && first ? Math.min(1, (last - first) / (last - floor)) : 0;

  return (
    <>
      <PageHeader
        title={greeting()}
        description={
          <span className="inline-flex items-center gap-2">
            <span className="dot" style={{ background: m.state === "open" ? "var(--pos-chart)" : "var(--border-2)" }} />
            {m.label} Prices are end of day, as of {fmtDate(overview[0]?.last_ts)}.
          </span>
        }
      />

      {showFirstRun && <FirstRun signedIn={!!viewer} name={viewer?.firstName ?? null} suggestions={active.slice(0, 6).map((r) => ({ symbol: r.symbol, name: r.name }))} />}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="h3">Market overview</h2>
          <span className="card-s">ETF proxies. Index levels aren&apos;t in the current data plan.</span>
        </div>
        <MarketStrip rows={overview} />
      </section>

      {breadth && <BreadthSummary b={breadth} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="card">
          <div className="card-h">
            <div>
              <h2 className="card-t">Most active</h2>
              <p className="card-s mt-0.5">Ranked by 20-day average dollar volume</p>
            </div>
            <Link href="/scanner" className="btn sm ml-auto">Open scanner</Link>
          </div>
          <ScannerTable rows={active} compact />
        </section>

        <section className="card flex flex-col">
          <div className="card-h">
            <div>
              <h2 className="card-t">Wave structure today</h2>
              <p className="card-s mt-0.5">Preferred daily counts, securities over $25M a day</p>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-5 px-5 py-5">
            <ul className="grid grid-cols-2 gap-2">
              {presetCounts.map((p) => (
                <li key={p.k}>
                  <Link href={`/scanner?s=${p.k}&dv=${LIQUID}`} className="flex h-full flex-col rounded-[var(--r-md)] border border-line px-3 py-2.5 transition-colors hover:border-line-2 hover:bg-hover">
                    <span className="num text-[18px] font-[650] tracking-[-0.02em]">{fmtInt(p.n)}</span>
                    <span className="text-[12.5px] text-fg-2">{p.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {swingTotal > 0 && (
              <div>
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="font-medium">Intermediate swing structure, daily</span>
                  <span className="num text-fg-3">{fmtInt(swingTotal)}</span>
                </div>
                <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-hover">
                  {SWING_ORDER.map(([k, c]) => (
                    <i key={k} style={{ width: `${((swingCounts[k] ?? 0) / swingTotal) * 100}%`, background: c }} title={SWING_LABEL[k]} />
                  ))}
                </div>
                <ul className="mt-3 grid grid-cols-1 gap-1.5 text-[12.5px] sm:grid-cols-2 xl:grid-cols-1">
                  {SWING_ORDER.map(([k, c]) => (
                    <li key={k} className="flex items-center gap-2">
                      <span className="dot" style={{ background: c }} />
                      <span className="text-fg-2">{SWING_LABEL[k]}</span>
                      <span className="num ml-auto font-medium">{fmtInt(swingCounts[k] ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {st && (
              <div className="mt-auto rounded-[var(--r-md)] bg-panel-2 px-4 py-3">
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="font-medium">Price history backfill</span>
                  <span className="num text-fg-2">{Math.round(backfill * 100)}%</span>
                </div>
                <div className="bar mt-2"><i style={{ width: `${backfill * 100}%` }} /></div>
                <p className="mt-2 text-[12.5px] text-fg-3">
                  {fmtInt(st.sessions_open)} sessions for {fmtInt(st.coverage_full)} securities. <Link href="/data-sources" className="text-brand hover:underline">Data sources</Link>
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-h">
          <div>
            <h2 className="card-t">Highest-confidence structures</h2>
            <p className="card-s mt-0.5">Preferred daily counts with Pattern Confidence 70+, most confident first</p>
          </div>
          <Link href={`/scanner?score=70&dv=${LIQUID}&sort=confidence`} className="btn sm ml-auto">See all</Link>
        </div>
        {setups.length ? (
          <ul className="divide-y divide-line">
            {setups.map((r) => (
              <li key={r.symbol}>
                <Link href={stockHref(r.symbol)} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-hover">
                  <span className="tk w-16">{r.symbol}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg-2">{r.name}</span>
                  <span className="whitespace-nowrap text-[13px]">{countLabel(r)}</span>
                  <span className="num w-20 text-right text-[12.5px] text-fg-3" title="Distance to the count's invalidation level">
                    {r.hold_dist != null ? `${(r.hold_dist * 100).toFixed(1)}% inv.` : "—"}
                  </span>
                  <span className="num w-8 text-right text-[14px] font-[650]">{r.glance_score}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-[13px] text-fg-2">No liquid security has a preferred count at 70 or above right now. The ranking may still be computing; the scanner shows its progress.</p>
        )}
        <div className="src"><span><b>Note</b>Pattern Confidence ranks how well a count fits Elliott guidelines. It is not a forecast, a probability or a recommendation.</span></div>
      </section>
    </>
  );
}
