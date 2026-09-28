"use client";

import { useState } from "react";
import { Sparkline } from "@/components/Sparkline";
import { fmtPrice } from "@/lib/market-data/bars";
import { TREND_LABEL } from "@/lib/market-data/snapshot";
import { PULSE_GROUPS, fmtPct, returns, type PulseRow } from "@/lib/analysis/mission";
import { useDrawer } from "./SecurityDrawer";

const PERIODS = [["d1", "1D"], ["w1", "1W"], ["m1", "1M"]] as const;
type Period = (typeof PERIODS)[number][0];
const TREND_DOT = { uptrend: "var(--pos-chart)", mixed: "var(--neutral)", downtrend: "var(--neg)", insufficient: "var(--border-2)" } as const;

/** Market Pulse: equities, rates and macro through liquid ETF proxies, with a 1D / 1W / 1M switch. */
export function MarketPulse({ rows, asOf }: { rows: PulseRow[]; asOf: string }) {
  const [period, setPeriod] = useState<Period>("d1");
  const { open } = useDrawer();
  const by = new Map(rows.map((r) => [r.symbol, r]));
  return (
    <section className="card" aria-labelledby="pulse-t">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
        <h2 id="pulse-t" className="card-t">Market pulse</h2>
        <span
          className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-line text-[11px] text-fg-3" tabIndex={0}
          title="Index, yield and futures data aren't in the current data plan, so each market is shown through a liquid ETF that tracks it. Rates are Treasury ETF prices, which fall when yields rise."
          aria-label="About these prices: ETF proxies"
        >i</span>
        <span className="text-[12px] text-fg-3">End of day, {asOf}</span>
        <div className="seg ml-auto" role="tablist" aria-label="Change period">
          {PERIODS.map(([k, l]) => <button key={k} role="tab" aria-selected={period === k} onClick={() => setPeriod(k)}>{l}</button>)}
        </div>
      </div>
      <div className="grid gap-px bg-line md:grid-cols-3">
        {PULSE_GROUPS.map((g) => (
          <div key={g.id} className="bg-panel px-2 py-2">
            <div className="flex items-baseline gap-2 px-2 pb-1 pt-0.5">
              <span className="text-[11.5px] font-[600] uppercase tracking-[0.06em] text-fg-3">{g.label}</span>
              <span className="truncate text-[11px] text-fg-3/80" title={g.note}>{g.id === "rates" ? "price ↓ = yield ↑" : ""}</span>
            </div>
            <ul>
              {g.items.map((it) => {
                const r = by.get(it.symbol);
                const ch = r ? returns(r)[period] : null;
                return (
                  <li key={it.symbol}>
                    <button
                      onClick={() => open(it.symbol)} disabled={!r}
                      className="grid w-full grid-cols-[minmax(0,1fr)_60px_auto] items-center gap-3 rounded-[var(--r-md)] px-2 py-1.5 text-left transition-colors hover:bg-hover"
                      title={it.hint ? `${it.hint} (${it.symbol})` : `${it.label} (${it.symbol})`}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-[13px] font-[560]">
                          {r?.trend && <span className="dot" style={{ background: TREND_DOT[r.trend] }} title={TREND_LABEL[r.trend]} />}
                          <span className="truncate">{it.label}</span>
                        </span>
                        <span className="block text-[11px] text-fg-3">{it.symbol}{r?.trend ? ` · ${TREND_LABEL[r.trend]}` : ""}</span>
                      </span>
                      {r && r.spark.length > 1 ? <Sparkline values={r.spark} width={60} height={22} /> : <span />}
                      <span className="text-right">
                        <span className="num block text-[13px]">{r ? fmtPrice(r.close) : "—"}</span>
                        <span className={`num block text-[12px] font-medium ${ch == null ? "text-fg-3" : ch >= 0 ? "text-pos" : "text-neg"}`}>{fmtPct(ch, period === "d1" ? 2 : 1)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
