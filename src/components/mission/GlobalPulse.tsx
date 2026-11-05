"use client";

import { useEffect, useState } from "react";
import { Sparkline } from "@/components/Sparkline";
import { fmtPrice } from "@/lib/market-data/bars";
import { TREND_LABEL } from "@/lib/market-data/snapshot";
import { HUBS, hubStatus, sessionProgress, type HubId } from "@/lib/market-sessions";
import { GLOBAL_GAUGES, PULSE_GROUPS, REGIONS, fmtPct, returns, type PulseRow } from "@/lib/analysis/mission";
import type { Freshness } from "@/lib/data-freshness";
import { useDrawer } from "./SecurityDrawer";

const PERIODS = [["d1", "1D"], ["w1", "1W"], ["m1", "1M"]] as const;
type Period = (typeof PERIODS)[number][0];
const STATE = { open: ["Open", "var(--pos-chart)"], break: ["Lunch break", "var(--warn)"], closed: ["Closed", "var(--text-3)"] } as const;
const TREND_DOT = { uptrend: "var(--pos-chart)", mixed: "var(--neutral)", downtrend: "var(--neg)", insufficient: "var(--border-2)" } as const;
const SHORT: Record<HubId, string> = { ny: "NYSE · Nasdaq", london: "LSE", frankfurt: "Xetra", tokyo: "TSE", hongkong: "HKEX", sf: "" };

const tone = (v: number | null) => (v == null ? "text-fg-3" : v >= 0 ? "text-pos" : "text-neg");

/**
 * Global Market Pulse: the world's major exchanges on a live clock (open, lunch break or closed, and
 * how far through the day each is), the major U.S. indices and international, credit and macro
 * gauges. Index and futures data aren't in the plan, so each market is read through a liquid ETF,
 * and every price is a close labelled with its session. No canvas, no continuous animation.
 */
export function GlobalPulse({ rows, freshness }: { rows: PulseRow[]; freshness: Freshness }) {
  const [period, setPeriod] = useState<Period>("d1");
  const [now, setNow] = useState<Date | null>(null);
  const { open } = useDrawer();
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  const by = new Map(rows.map((r) => [r.symbol, r]));
  const ch = (sym: string) => { const r = by.get(sym); return r ? returns(r)[period] : null; };
  const digits = period === "d1" ? 2 : 1;
  const indices = PULSE_GROUPS.find((g) => g.id === "equities")!.items;
  const tape = [...GLOBAL_GAUGES, ...PULSE_GROUPS.filter((g) => g.id !== "equities").flatMap((g) => g.items)];

  return (
    <section className="card overflow-hidden" aria-labelledby="gp-t">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2.5">
        <h2 id="gp-t" className="card-t">Global market pulse</h2>
        <span className="text-[12px] text-fg-3">{freshness.label} · ETF proxies · {PERIODS.find(([k]) => k === period)![1]} change</span>
        <div className="seg ml-auto" role="tablist" aria-label="Change period">
          {PERIODS.map(([k, l]) => <button key={k} role="tab" aria-selected={period === k} onClick={() => setPeriod(k)}>{l}</button>)}
        </div>
      </header>

      {/* exchanges on a live clock */}
      <ul className="flex snap-x snap-mandatory gap-px overflow-x-auto border-b border-line bg-line sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-5" aria-label="Exchange sessions">
        {REGIONS.map((reg) => {
          const hub = HUBS.find((h) => h.id === reg.hub)!;
          const st = now ? hubStatus(hub, now) : null;
          const prog = now ? sessionProgress(hub, now) : null;
          const v = ch(reg.symbol);
          return (
            <li key={reg.hub} className="min-w-[210px] flex-1 snap-start bg-panel sm:min-w-0">
              <button onClick={() => open(reg.symbol)} className="flex h-full w-full flex-col gap-1.5 px-3.5 py-2.5 text-left transition-colors hover:bg-hover" title={`${hub.exchange}. ${reg.label} read through ${reg.symbol}.`}>
                <span className="flex items-center gap-2">
                  <span className="whitespace-nowrap text-[13px] font-[600]">{hub.city}</span>
                  <span className="hidden truncate text-[11px] text-fg-3 xl:inline">{SHORT[hub.id]}</span>
                  <span className="num ml-auto whitespace-nowrap text-[12px] text-fg-2">{st?.localTime ?? <span className="skel inline-block h-3 w-12 align-middle" />}</span>
                </span>
                <span className="relative h-1 overflow-hidden rounded-full bg-hover" aria-hidden>
                  {prog != null && prog > 0 && (
                    <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
                      style={{ width: `${prog * 100}%`, background: st?.state === "open" ? "var(--brand)" : "var(--border-2)" }} />
                  )}
                </span>
                <span className="flex items-center gap-1.5 text-[11.5px]">
                  {st ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATE[st.state][1] }} aria-hidden />
                      <span className="font-medium" style={{ color: st.state === "closed" ? "var(--text-2)" : STATE[st.state][1] }}>{STATE[st.state][0]}</span>
                      <span className="truncate text-fg-3">· {st.next}</span>
                    </>
                  ) : <span className="skel h-3 w-24" />}
                </span>
                <span className="flex items-baseline gap-1.5 text-[11.5px] text-fg-3">
                  <span>{reg.label}</span><span className="tk text-[11px] text-fg-3">{reg.symbol}</span>
                  <span className={`num ml-auto text-[12.5px] font-medium ${tone(v)}`}>{fmtPct(v, digits)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* indices */}
      <ul className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4" aria-label="U.S. indices">
        {indices.map((it) => {
          const r = by.get(it.symbol);
          const v = ch(it.symbol);
          return (
            <li key={it.symbol} className="bg-panel">
              <button onClick={() => open(it.symbol)} disabled={!r} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3.5 py-3 sm:px-4 text-left transition-colors hover:bg-hover">
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[12.5px] text-fg-2">
                    {r?.trend && <span className="dot" style={{ background: TREND_DOT[r.trend] }} title={TREND_LABEL[r.trend]} />}
                    {it.label} <span className="tk text-[11px] text-fg-3">{it.symbol}</span>
                  </span>
                  <span className="num mt-0.5 block text-[19px] font-[620] leading-tight tracking-[-0.02em]">{r ? fmtPrice(r.close) : "—"}</span>
                  <span className={`num text-[12.5px] font-medium ${tone(v)}`}>{fmtPct(v, digits)}</span>
                </span>
                {r && r.spark.length > 1 ? <Sparkline values={r.spark} width={84} height={34} className="hidden sm:block" /> : <span className="hidden w-[84px] sm:block" />}
              </button>
            </li>
          );
        })}
      </ul>

      {/* international, credit, rates and macro gauges */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line bg-panel-2 px-4 py-2" aria-label="Gauges">
        {tape.map((it) => {
          const v = ch(it.symbol);
          return (
            <button key={it.symbol} onClick={() => open(it.symbol)} className="inline-flex items-baseline gap-1.5 text-[12px] transition-colors hover:text-fg" title={it.hint ? `${it.hint} (${it.symbol})` : it.symbol}>
              <span className="text-fg-2">{it.label === it.symbol ? it.symbol : it.label}</span>
              <span className={`num font-medium ${tone(v)}`}>{fmtPct(v, digits)}</span>
            </button>
          );
        })}
        <span className="hidden text-[11px] text-fg-3 sm:ml-auto sm:inline" title="Treasury ETFs are prices, not yields: they fall when yields rise.">SHY, IEF, TLT are prices, not yields</span>
      </div>
    </section>
  );
}
