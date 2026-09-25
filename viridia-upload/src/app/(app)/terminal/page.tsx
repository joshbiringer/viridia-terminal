import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/supabase";
import { getBreadth, getOverview, scan } from "@/lib/market-data/snapshot";
import { greeting, marketState } from "@/lib/market-hours";
import { fmtDate, fmtInt } from "@/lib/format";
import { MarketStrip } from "@/components/MarketStrip";
import { BreadthSummary } from "@/components/BreadthSummary";
import { ScannerTable } from "@/components/ScannerTable";
import { OpenPaletteButton } from "@/components/OpenPaletteButton";
import { SWING_LABEL, type SwingStructure } from "@/lib/analysis/pivots";

const SWING_ORDER: [SwingStructure, string][] = [
  ["higher_highs_lows", "var(--pos-chart)"], ["expanding", "var(--alt)"], ["contracting", "var(--fib)"],
  ["lower_highs_lows", "var(--neg)"], ["insufficient", "var(--border-2)"],
];

export const metadata: Metadata = { title: "Terminal" };
export const dynamic = "force-dynamic";

type Status = { sessions_open: number; first_session: string | null; last_session: string | null; floor: string; coverage_full: number };

const ENGINE: [string, string][] = [
  ["Pivot detection", "Live"],
  ["Hard-rule validation", "Live"],
  ["Candidate counts", "Phase 5"],
  ["Fibonacci and confluence", "Phase 6"],
  ["Preferred and alternate ranking", "Phase 7"],
];

export default async function TerminalHome() {
  const [overview, breadth, active, statusRes, swingRes] = await Promise.all([
    getOverview(), getBreadth(), scan({ p_sort: "dollar_volume", p_limit: 10 }), db().rpc("market_data_status"),
    db().rpc("swing_breadth", { p_timeframe: "1d", p_degree: "intermediate" }),
  ]);
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
      <section className="flex flex-col gap-5 pt-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-[34px] font-[640] leading-tight tracking-[-0.035em]">{greeting()}</h1>
          <p className="mt-1 flex items-center gap-2 text-[15px] text-fg-2">
            <span className="dot" style={{ background: m.state === "open" ? "var(--pos-chart)" : "var(--border-2)" }} />
            {m.label} Prices shown are end of day, as of {fmtDate(overview[0]?.last_ts)}.
          </p>
        </div>
        <OpenPaletteButton label="Search markets" className="btn lg w-full justify-start text-fg-3 md:w-[320px]" />
      </section>

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
              <h2 className="card-t">Structure scanner</h2>
              <p className="card-s mt-0.5">Elliott Wave engine · pivots live, counts in development</p>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-5 px-5 py-5">
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
            <p className="text-[13px] leading-relaxed text-fg-2">
              Swings come from the adaptive pivot engine. Wave position, pattern confidence, Fibonacci zones and invalidation levels
              follow in Phases 4–7; until then Viridia shows no wave labels rather than guesses.
            </p>
            <ol className="flex flex-col">
              {ENGINE.map(([k, p]) => (
                <li key={k} className="flex items-center justify-between border-b border-line py-2.5 text-[13.5px] last:border-0">
                  <span>{k}</span>{p === "Live" ? <span className="chip pos">Live</span> : <span className="text-[12.5px] text-fg-3">{p}</span>}
                </li>
              ))}
            </ol>
            {st && (
              <div className="mt-auto rounded-[10px] bg-panel-2 px-4 py-3">
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
    </>
  );
}
