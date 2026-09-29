"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { stockHref } from "@/lib/format";
import {
  ASSET_LABEL, CLUSTER_CORR, MIN_FIT, FACTORS, IEF_DURATION, NEAR_INVALIDATION, SECTOR_ETFS, patternName, type Workspace,
} from "@/lib/portfolio/workspace";
import type { Change } from "@/lib/portfolio/snapshot";
import { DRIFT_BAND } from "@/lib/portfolio/xray";
import { HBars, Heatmap, PerfChart, StackBar, WeightRiskChart, pctS, pctU, usd } from "./charts";

// ---------------------------------------------------------------- shared pieces

export function Block({ title, sub, action, children, id }: { title: string; sub?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section className="border-t border-line first:border-t-0" aria-labelledby={id}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-2 pt-4">
        <h3 id={id} className="text-[11.5px] font-[650] uppercase tracking-[0.07em] text-fg-2">{title}</h3>
        {sub && <span className="text-[12px] text-fg-3">{sub}</span>}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <div className="px-5 pb-4">{children}</div>
    </section>
  );
}

export function Metrics({ items }: { items: { k: string; v: string; note?: string; tone?: "pos" | "neg" | "warn" }[] }) {
  return (
    <dl className="grid grid-cols-2 border-b border-line sm:grid-cols-3 lg:grid-cols-6">
      {items.map((m) => (
        <div key={m.k} className="border-r border-t border-line px-4 py-2.5 [&:nth-child(-n+6)]:border-t-0">
          <dt className="text-[11.5px] text-fg-3">{m.k}</dt>
          <dd className={`num text-[18px] font-[650] leading-tight tracking-[-0.015em] ${m.tone === "pos" ? "text-pos" : m.tone === "neg" ? "text-neg" : ""}`} style={m.tone === "warn" ? { color: "var(--warn)" } : undefined}>{m.v}</dd>
          {m.note && <dd className="truncate text-[11px] text-fg-3" title={m.note}>{m.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

const tone = (v: number | null | undefined) => (v == null ? undefined : v > 0 ? "pos" : v < 0 ? "neg" : undefined) as "pos" | "neg" | undefined;
const TK = ({ s }: { s: string }) => (s === "USD" ? <span className="tk">Cash</span> : <Link href={stockHref(s)} className="tk hover:text-brand">{s}</Link>);
const Method = ({ children }: { children: React.ReactNode }) => <p className="mt-2 text-[11.5px] leading-relaxed text-fg-3">{children}</p>;
const f2 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(2));

const TREND_COLOR = { uptrend: "var(--pos-chart)", mixed: "var(--neutral)", downtrend: "var(--neg)", unknown: "var(--border-2)" };
const SERIES_COLOR: Record<string, string> = { portfolio: "var(--brand)", spy: "var(--neutral)", qqq: "var(--fib)", "6040": "var(--alt)", custom: "var(--text-2)", compare: "var(--text-2)" };

// ---------------------------------------------------------------- overview

export function OverviewTab({ ws, bench, setBench, changes, since, go }: {
  ws: Workspace; bench: string; setBench: (b: string) => void; changes: Change[] | null; since: string | null; go: (tab: string) => void;
}) {
  const m = ws.metrics;
  const b = ws.benchmarks.find((x) => x.id === bench);
  const series = [
    { id: "portfolio", label: "Portfolio", values: ws.perf.portfolio, color: SERIES_COLOR.portfolio },
    ...(ws.perf.benchmarks[bench] ? [{ id: bench, label: b?.label ?? bench, values: ws.perf.benchmarks[bench], color: SERIES_COLOR[bench] ?? "var(--neutral)" }] : []),
  ];
  return (
    <>
      <Metrics items={[
        { k: "Portfolio value", v: usd(m.value), note: `${m.holdings} holdings` },
        { k: "Daily change", v: m.dayPnl != null ? usd(m.dayPnl, true) : "—", note: pctS(m.dayPct, 2), tone: tone(m.dayPnl) },
        { k: "YTD return", v: pctS(m.ytd), note: "constant-weight back-cast", tone: tone(m.ytd) },
        { k: "1Y return", v: pctS(m.r1y), note: "constant-weight back-cast", tone: tone(m.r1y) },
        { k: "Volatility", v: pctU(m.vol), note: "annualized, 1Y" },
        { k: "Beta", v: f2(m.beta), note: "to SPY, 1Y" },
        { k: "Maximum drawdown", v: pctS(m.mdd), note: "1Y, peak to trough", tone: m.mdd ? "neg" : undefined },
        { k: "Sharpe ratio", v: f2(m.sharpe), note: "1Y, over T-bills (BIL)" },
        { k: "Income yield", v: "—", note: "Dividend data isn't loaded" },
        { k: "Holdings", v: String(m.holdings), note: `${ws.concentration.effective.toFixed(1)} effective by weight` },
        { k: "Cash", v: pctU(m.cash), note: "cash and T-bill funds" },
        { k: "Independent exposures", v: ws.risk.enb != null ? ws.risk.enb.toFixed(1) : "—", note: "effective number of bets", },
      ]} />

      <div className="grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="lg:border-r lg:border-line">
          <Block title="Viridia portfolio insights" sub="Computed from this X-Ray; no estimates added">
            <ol className="flex flex-col divide-y divide-line">
              {ws.insights.map((i, n) => (
                <li key={i.id} className="flex gap-3 py-2 text-[13.5px] leading-snug">
                  <span className="num w-5 shrink-0 pt-px text-[12px] text-fg-3">{n + 1}</span>
                  <span className={i.tone === "neg" ? "text-neg" : "text-fg"} style={i.tone === "warn" ? { color: "var(--warn)" } : undefined}>{i.text}</span>
                </li>
              ))}
            </ol>
          </Block>
          {changes && (
            <Block title="What changed" sub={since ? `Since the snapshot of ${since}` : undefined}>
              {changes.length ? (
                <ul className="flex flex-col gap-1 text-[13px] text-fg-2">
                  {changes.map((c, i) => <li key={i} className="flex gap-2"><span className="w-[74px] shrink-0 text-[11px] font-[600] uppercase tracking-[0.05em] text-fg-3">{c.kind}</span><span className={c.tone === "neg" ? "text-neg" : c.tone === "pos" ? "text-pos" : ""} style={c.tone === "warn" ? { color: "var(--warn)" } : undefined}>{c.text}</span></li>)}
                </ul>
              ) : <p className="text-[13px] text-fg-3">Nothing material has changed.</p>}
            </Block>
          )}
        </div>
        <div>
          <Block title="Top holdings" action={<button className="text-[12px] text-brand hover:underline" onClick={() => go("holdings")}>All holdings</button>}>
            <table className="t dense text-[13px]">
              <thead><tr><th>Holding</th><th className="r">Weight</th><th className="r">Value</th><th className="r">Day</th></tr></thead>
              <tbody>
                {ws.positions.slice(0, 8).map((p) => (
                  <tr key={p.symbol}><td><TK s={p.symbol} /></td><td className="r num">{pctU(p.weight)}</td><td className="r num text-fg-2">{usd(p.value)}</td>
                    <td className={`r num ${p.dayChange == null ? "" : p.dayChange >= 0 ? "text-pos" : "text-neg"}`}>{pctS(p.dayChange, 2)}</td></tr>
                ))}
              </tbody>
            </table>
          </Block>
        </div>
      </div>

      <div className="grid border-t border-line lg:grid-cols-2">
        <div className="lg:border-r lg:border-line">
          <Block title="Asset allocation" sub="Funds classified by name">
            <StackBar parts={ws.allocation.map((a, i) => ({ label: ASSET_LABEL[a.asset], value: a.weight, color: ["var(--brand)", "var(--neutral)", "var(--fib)", "var(--alt)", "var(--border-2)", "var(--text-3)"][i] }))} />
          </Block>
        </div>
        <Block title="Sector exposure" sub="Estimated from returns" action={<button className="text-[12px] text-brand hover:underline" onClick={() => go("exposure")}>Method</button>}>
          <HBars rows={ws.sectors.slice(0, 8).map((s) => ({ label: s.sector, value: s.weight, muted: s.sector === "Unclassified" }))} />
        </Block>
      </div>

      <Block title="Portfolio vs benchmark" sub="Growth of 100 over the past year, today's weights"
        action={
          <div className="seg" role="tablist" aria-label="Benchmark">
            {ws.benchmarks.filter((x) => x.id !== "portfolio").map((x) => <button key={x.id} role="tab" aria-selected={bench === x.id} onClick={() => setBench(x.id)}>{x.label.replace(/ \(.*\)$/, "")}</button>)}
          </div>
        }>
        <PerfChart dates={ws.perf.dates} series={series} />
        <BenchmarkTable ws={ws} />
        <Method>History is a constant-weight back-cast: today&apos;s weights applied to each holding&apos;s past daily returns, with cash earning the T-bill ETF (BIL). It is not the account&apos;s actual record. The 60/40 benchmark is 60% SPY and 40% AGG, rebalanced daily.</Method>
      </Block>
    </>
  );
}

function BenchmarkTable({ ws }: { ws: Workspace }) {
  const cols = ws.benchmarks;
  if (!cols.length) return null;
  const row = (label: string, f: (b: (typeof cols)[number]) => React.ReactNode) => (
    <tr><th className="whitespace-nowrap text-left font-normal text-fg-3">{label}</th>{cols.map((b) => <td key={b.id} className="r num">{f(b)}</td>)}</tr>
  );
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="t dense text-[12.5px]">
        <thead><tr><th /> {cols.map((b) => <th key={b.id} className="r">{b.id === "portfolio" ? "Portfolio" : b.label.replace(/ \(.*\)$/, "")}</th>)}</tr></thead>
        <tbody>
          {row("Return, 1Y", (b) => pctS(b.r1y))}
          {row("Volatility", (b) => pctU(b.vol))}
          {row("Maximum drawdown", (b) => pctS(b.mdd))}
          {row("Beta to SPY", (b) => f2(b.beta))}
          {row("Sharpe ratio", (b) => f2(b.sharpe))}
          {row("Correlation to portfolio", (b) => f2(b.corr))}
          {row("Largest sector (est.)", (b) => (b.topSector ? <span className="whitespace-nowrap">{b.topSector.sector} {pctU(b.topSector.w, 0)}</span> : "—"))}
          {FACTORS.map((f) => <Fragment key={f.key}>{row(`${f.label} loading`, (b) => f2(b.factors[f.key]))}</Fragment>)}
          {row("Weight in Viridia uptrends", (b) => pctU(b.uptrend, 0))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- risk

export function RiskTab({ ws }: { ws: Workspace }) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = ws.risk.rows;
  return (
    <>
      <Metrics items={[
        { k: "Volatility", v: pctU(ws.metrics.vol), note: "annualized, 1Y" },
        { k: "Beta", v: f2(ws.metrics.beta), note: "to SPY" },
        { k: "Maximum drawdown", v: pctS(ws.metrics.mdd), note: "1Y" },
        { k: "Sharpe ratio", v: f2(ws.metrics.sharpe), note: "1Y" },
        { k: "Independent exposures", v: ws.risk.enb != null ? ws.risk.enb.toFixed(1) : "—", note: "effective number of bets" },
        { k: "Risk concentration", v: ws.risk.topShare ? pctU(ws.risk.topShare.share, 0) : "—", note: ws.risk.topShare ? `from the top ${ws.risk.topShare.n} holdings` : undefined },
      ]} />
      <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="lg:border-r lg:border-line">
          <Block title="Weight vs risk contribution" sub="Above the line: more risk than weight">
            <WeightRiskChart rows={rows} flagged={ws.risk.flagged} />
            {ws.risk.flagged.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1 text-[12.5px]">
                {ws.risk.flagged.map((s) => { const r = rows.find((x) => x.symbol === s)!; return <li key={s} style={{ color: "var(--warn)" }}>● <b className="tk">{s}</b> {pctU(r.weight)} of value, {pctU(r.contribution)} of risk ({(r.contribution! / r.weight).toFixed(1)}×)</li>; })}
              </ul>
            ) : <p className="mt-2 text-[12.5px] text-fg-3">No holding contributes materially more risk than its weight.</p>}
          </Block>
        </div>
        <Block title="Risk by position" sub={`Past ${Math.min(ws.metrics.historyDays, 252)} shared sessions`}>
          <div className="overflow-x-auto">
            <table className="t dense text-[12.5px]">
              <thead><tr><th>Holding</th><th className="r">Weight</th><th className="r">Volatility</th><th className="r">Beta</th><th className="r">Share of risk</th><th className="r">Max DD</th><th className="r" title="Correlation to the portfolio">ρ portfolio</th><th className="r" title="Correlation to SPY">ρ SPY</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const f = ws.risk.flagged.includes(r.symbol);
                  return (
                    <tr key={r.symbol}>
                      <td><TK s={r.symbol} /></td>
                      <td className="r num">{pctU(r.weight)}</td>
                      <td className="r num">{pctU(r.vol, 0)}</td>
                      <td className="r num">{f2(r.beta)}</td>
                      <td className="r">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-1.5 w-14 overflow-hidden rounded-full bg-hover"><i className="block h-full" style={{ width: `${Math.min(1, Math.max(0, r.contribution ?? 0)) * 100}%`, background: f ? "var(--warn)" : "var(--brand)" }} /></span>
                          <span className="num w-12 font-[600]" style={f ? { color: "var(--warn)" } : undefined}>{pctU(r.contribution)}</span>
                        </span>
                      </td>
                      <td className="r num text-neg">{pctS(r.mdd, 0)}</td>
                      <td className="r num">{f2(r.corrPortfolio)}</td>
                      <td className="r num">{f2(r.corrBenchmark)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {ws.unmodeled.length > 0 && <p className="mt-2 text-[12px] text-fg-3">Left out of the risk model for lack of 60 sessions of history: {ws.unmodeled.join(", ")}.</p>}
        </Block>
      </div>
      <Block title="Stress test" sub="Historical replays and modeled shocks. Neither is a prediction.">
        <div className="overflow-x-auto">
          <table className="t dense text-[12.5px]">
            <thead><tr><th>Scenario</th><th>Type</th><th className="r">Portfolio</th><th className="r">S&amp;P 500 (SPY)</th><th className="r">Difference</th><th className="r">Coverage</th><th /></tr></thead>
            <tbody>
              {ws.stress.map((s) => (
                <Fragment key={s.id}>
                  <tr>
                    <td className="max-w-[320px]"><span className="font-[560] text-fg">{s.label}</span></td>
                    <td><span className="rounded-[4px] border border-line px-1.5 py-px text-[11px] font-[600] uppercase tracking-[0.04em] text-fg-2">{s.kind === "historical" ? "Historical replay" : "Modeled"}</span></td>
                    <td className={`r num font-[600] ${s.portfolio == null ? "" : s.portfolio < 0 ? "text-neg" : "text-pos"}`}>{pctS(s.portfolio)}</td>
                    <td className="r num text-fg-2">{pctS(s.benchmark)}</td>
                    <td className="r num">{s.portfolio != null && s.benchmark != null ? `${pctS(s.portfolio - s.benchmark)}` : "—"}</td>
                    <td className="r num text-fg-3">{pctU(s.coverage, 0)}</td>
                    <td className="r"><button className="text-[12px] text-brand hover:underline" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>{open === s.id ? "Hide" : "Positions"}</button></td>
                  </tr>
                  {open === s.id && (
                    <tr><td colSpan={7} className="bg-hover/40">
                      <p className="mb-2 text-[12px] text-fg-3">{s.definition}</p>
                      <HBars signed rows={s.contributions.filter((c) => c.contribution != null).slice(0, 12).map((c) => ({ label: `${c.symbol === "USD" ? "Cash" : c.symbol} (${pctS(c.impact)})`, value: c.contribution!, tone: c.contribution! < 0 ? "neg" : "pos" }))} format={(v) => pctS(v, 2)} />
                      <p className="mt-1 text-[11.5px] text-fg-3">Bars are each holding&apos;s contribution to the portfolio result (weight × holding move).</p>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <Method>
          Historical replays apply each holding&apos;s actual return over the dated window at today&apos;s weights; the windows are found in Viridia&apos;s stored history (about two years), so 2008, 2020 and 2022 can&apos;t be replayed yet.
          Modeled shocks multiply each holding&apos;s one-year beta to the proxy by the proxy&apos;s move; rates shocks assume IEF has a duration of about {IEF_DURATION} years. Coverage is the share of value with enough data.
        </Method>
      </Block>
      <Block title="Method">
        <Method>
          Risk contribution: each holding&apos;s share of portfolio variance, wᵢ(Σw)ᵢ / wᵀΣw, from the covariance of daily returns over the last 252 sessions every modeled holding traded; shares sum to 100%. Flagged when a holding&apos;s share of risk is at least 3 points and 1.25× above its weight.
          Independent exposures: the effective number of bets (Meucci), the exponential of the entropy of the portfolio&apos;s variance across the covariance matrix&apos;s principal components. Sharpe ratio uses daily excess returns over BIL, annualized.
        </Method>
      </Block>
    </>
  );
}

// ---------------------------------------------------------------- exposure

export function ExposureTab({ ws }: { ws: Workspace }) {
  const f = ws.factors;
  return (
    <>
      <div className="grid lg:grid-cols-2">
        <div className="lg:border-r lg:border-line">
          <Block title="Asset allocation">
            <HBars rows={ws.allocation.map((a) => ({ label: ASSET_LABEL[a.asset], value: a.weight }))} />
            <Method>Stocks and funds come from each security&apos;s listing type; funds are split into equity, bond and T-bill funds by name. Cash is entered as USD.</Method>
          </Block>
        </div>
        <Block title="Sector exposure" sub="Estimated, including inside funds">
          <HBars rows={ws.sectors.map((s) => ({ label: s.sector, value: s.weight, muted: s.sector === "Unclassified" }))} />
        </Block>
      </div>
      <Block title="Factor exposure" sub={f.r2 != null ? `R² ${pctU(f.r2, 0)} over ${f.n} sessions` : "Needs 120 shared sessions"}>
        <div className="grid gap-x-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <HBars signed max={Math.max(0.5, ...f.rows.map((r) => Math.abs(r.loading ?? 0)))} format={(v) => v.toFixed(2)}
            rows={f.rows.filter((r) => r.loading != null).map((r) => ({ label: r.label, value: r.loading!, muted: Math.abs(r.t ?? 0) < 2, note: r.means }))} />
          <table className="t dense text-[12.5px]">
            <thead><tr><th>Factor</th><th className="r">Loading</th><th className="r">t-stat</th><th>Proxy</th></tr></thead>
            <tbody>
              {f.rows.map((r) => (
                <tr key={r.key}>
                  <td title={r.means}>{r.label}</td>
                  <td className="r num font-[600]">{f2(r.loading)}</td>
                  <td className={`r num ${Math.abs(r.t ?? 0) >= 2 ? "" : "text-fg-3"}`}>{r.t != null ? r.t.toFixed(1) : "—"}</td>
                  <td className="text-[12px] text-fg-3">{r.note ?? (() => { const x = FACTORS.find((q) => q.key === r.key); return x ? `${x.long} − ${x.short}` : ""; })()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Method>
          Loadings come from one regression of the portfolio&apos;s daily excess return (over BIL) on six ETF return spreads over the past year: {FACTORS.map((x) => `${x.label.toLowerCase()} (${x.means})`).join("; ")}.
          Grey bars are not statistically distinct from zero (|t| under 2). Loadings describe how the portfolio has moved with each factor; they are not a forecast or a recommendation.
        </Method>
      </Block>
      <Block title="Holdings by estimated sector">
        <div className="overflow-x-auto">
          <table className="t dense text-[12.5px]">
            <thead><tr><th>Holding</th><th className="r">Weight</th><th>Estimated mix</th><th className="r">Fit (R²)</th></tr></thead>
            <tbody>
              {ws.positions.map((p) => (
                <tr key={p.symbol}>
                  <td><TK s={p.symbol} /></td>
                  <td className="r num">{pctU(p.weight)}</td>
                  <td className="text-fg-2">{p.style ? p.style.slice(0, 3).map((x) => `${x.sector} ${pctU(x.w, 0)}`).join(" · ") : "Not enough history"}{p.styleR2 != null && p.styleR2 < MIN_FIT ? <span className="text-fg-3"> (weak fit: counted as unclassified)</span> : null}</td>
                  <td className="r num text-fg-3">{p.styleR2 != null ? pctU(p.styleR2, 0) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Method>
          Sector exposure is a returns-based style analysis (Sharpe, 1992): for each holding, the long-only mix of the eleven Select Sector SPDR ETFs ({SECTOR_ETFS.map((s) => s.symbol).join(", ")}), IEF and BIL whose daily returns best track it over the past year. This estimates what funds hold as well as stocks. A stock counts fully toward its best-fitting sector; a fund is spread across its estimated mix. Holdings with a fit under 15% are counted as unclassified. SEC industry codes aren&apos;t loaded yet.
        </Method>
      </Block>
    </>
  );
}

// ---------------------------------------------------------------- correlation

export function CorrelationTab({ ws }: { ws: Workspace }) {
  const [focus, setFocus] = useState<string | null>(null);
  const c = ws.correlation;
  return (
    <>
      <Metrics items={[
        { k: "Independent exposures", v: ws.risk.enb != null ? ws.risk.enb.toFixed(1) : "—", note: `across ${ws.positions.length} holdings` },
        { k: "Effective holdings by weight", v: ws.concentration.effective.toFixed(1), note: "1 ÷ Σ weight²" },
        { k: "Clusters", v: String(c.clusters.length), note: `average correlation ≥ ${CLUSTER_CORR.toFixed(2)}` },
        { k: "Largest cluster", v: c.clusters[0] ? pctU(c.clusters[0].weight) : "—", note: c.clusters[0]?.name },
        { k: "Holdings in matrix", v: String(c.symbols.length), note: c.symbols.length < ws.positions.length ? "largest 30 by weight" : "all modeled holdings" },
        { k: "Window", v: `${Math.min(ws.metrics.historyDays, 252)}`, note: "shared sessions" },
      ]} />
      <div className="grid xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="xl:border-r xl:border-line">
          <Block title="Correlation matrix" sub="Daily returns, past year">
            {c.symbols.length >= 2 ? <Heatmap symbols={c.symbols} matrix={c.matrix} focus={focus} onFocus={setFocus} /> : <p className="text-[13px] text-fg-3">Needs at least two holdings with 60 shared sessions.</p>}
          </Block>
        </div>
        <Block title="Correlation clusters" sub="Holdings that behave like one exposure">
          {c.clusters.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {c.clusters.map((g) => (
                <li key={g.name + g.symbols[0]} className="py-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-[600]">{g.name}</span>
                    <span className="num ml-auto text-[12.5px]">{pctU(g.weight)} of value</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-[12.5px]">
                    {g.symbols.map((s) => <button key={s} className={`tk hover:text-brand ${focus === s ? "text-brand" : ""}`} onClick={() => setFocus(focus === s ? null : s)}>{s}</button>)}
                    <span className="num ml-auto text-fg-3">avg ρ {g.avgCorr.toFixed(2)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-fg-3">No group of holdings has an average correlation of {CLUSTER_CORR.toFixed(2)} or more.</p>}
          <Method>
            Clusters: average-linkage grouping of holdings, merging while the average pairwise correlation between groups is at least {CLUSTER_CORR.toFixed(2)}. Each is named after the largest estimated sector of its members.
            Independent exposures (effective number of bets): the portfolio&apos;s variance is split across the principal components of the holdings&apos; covariance matrix, and the number is the exponential of that split&apos;s entropy. It equals the holding count only when holdings are uncorrelated and equally risky.
          </Method>
        </Block>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- structure

export function StructureTab({ ws }: { ws: Workspace }) {
  const s = ws.structure;
  const [sort, setSort] = useState<"weight" | "invalidation" | "score">("weight");
  const rows = [...s.rows].sort((a, b) =>
    sort === "weight" ? b.weight - a.weight
      : sort === "score" ? (b.score ?? -1) - (a.score ?? -1)
        : Math.abs(a.invalidationDist ?? 9) - Math.abs(b.invalidationDist ?? 9));
  return (
    <>
      <Metrics items={[
        { k: "Weight in uptrend", v: pctU(s.trend.uptrend), tone: "pos" },
        { k: "Weight mixed", v: pctU(s.trend.mixed) },
        { k: "Weight in downtrend", v: pctU(s.trend.downtrend), tone: s.trend.downtrend > 0 ? "neg" : undefined },
        { k: "Motive / impulse", v: pctU(s.motive), note: "impulse or diagonal counts" },
        { k: "Corrective", v: pctU(s.corrective), note: "zigzag, flat or triangle" },
        { k: "Near invalidation", v: pctU(s.nearInvalidation.weight), note: usd(s.nearInvalidation.value), tone: s.nearInvalidation.weight > 0 ? "warn" : undefined },
      ]} />
      <div className="grid lg:grid-cols-2">
        <div className="lg:border-r lg:border-line">
          <Block title="Trend state by weight" sub="Price versus the 50- and 200-day averages">
            <StackBar height={14} parts={[
              { label: "Uptrend", value: s.trend.uptrend, color: TREND_COLOR.uptrend }, { label: "Mixed", value: s.trend.mixed, color: TREND_COLOR.mixed },
              { label: "Downtrend", value: s.trend.downtrend, color: TREND_COLOR.downtrend }, { label: "Not measured", value: s.trend.unknown, color: TREND_COLOR.unknown },
            ]} />
          </Block>
        </div>
        <Block title="Preferred counts by weight" sub="Viridia's engine output only">
          <StackBar height={14} parts={[
            { label: "Potential wave 3", value: s.wave3, color: "var(--brand)" }, { label: "Potential wave 5", value: s.wave5, color: "var(--pos-chart)" },
            { label: "Other motive", value: Math.max(0, s.motive - s.wave3 - s.wave5), color: "var(--neutral)" },
            { label: "Corrective", value: s.corrective, color: "var(--fib)" }, { label: "No count", value: s.noCount, color: "var(--border-2)" },
          ]} />
        </Block>
      </div>
      <Block title="Structural risk" sub={`Holdings within ${pctU(NEAR_INVALIDATION, 0)} of the level that breaks the preferred count`}>
        {s.nearInvalidation.symbols.length ? (
          <p className="text-[13.5px]" style={{ color: "var(--warn)" }}>
            <b className="num">{pctU(s.nearInvalidation.weight)}</b> of portfolio value ({usd(s.nearInvalidation.value)}) is near a structural invalidation level: {s.nearInvalidation.symbols.join(", ")}.
          </p>
        ) : <p className="text-[13.5px] text-fg-2">No holding is within {pctU(NEAR_INVALIDATION, 0)} of its invalidation level.</p>}
      </Block>
      <Block title="Structure by security" action={
        <div className="seg" role="tablist" aria-label="Sort">
          {([["weight", "Weight"], ["invalidation", "Invalidation"], ["score", "Confidence"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={sort === k} onClick={() => setSort(k)}>{l}</button>)}
        </div>
      }>
        <div className="overflow-x-auto">
          <table className="t dense text-[12.5px]">
            <thead><tr><th>Ticker</th><th className="r">Weight</th><th>Trend</th><th>Preferred structure</th><th>Current wave</th><th className="r">Confidence</th><th className="r">Nearest Fib zone</th><th className="r">Invalidation</th><th className="r">Distance</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const near = r.invalidationDist != null && Math.abs(r.invalidationDist) <= NEAR_INVALIDATION;
                return (
                  <tr key={r.symbol}>
                    <td><TK s={r.symbol} /></td>
                    <td className="r num">{pctU(r.weight)}</td>
                    <td><span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full" style={{ background: TREND_COLOR[(r.trend as keyof typeof TREND_COLOR) ?? "unknown"] ?? TREND_COLOR.unknown }} />{r.trend && r.trend !== "insufficient" ? r.trend[0].toUpperCase() + r.trend.slice(1) : "Not measured"}</span></td>
                    <td>{r.pattern ? patternName(r.pattern) : <span className="text-fg-3">No count</span>}{r.degree && <span className="text-fg-3"> · {r.degree}</span>}</td>
                    <td className="whitespace-nowrap">{r.pattern ? (r.complete ? "Complete" : `Wave ${r.wave}`) : "—"}{r.dir ? <span className="text-fg-3"> {r.dir === "up" ? "↑" : "↓"}</span> : null}</td>
                    <td className="r num">{r.score ?? "—"}</td>
                    <td className="r num text-fg-2">{r.zone ? `${fmt(r.zone.low)}–${fmt(r.zone.high)}` : "—"}{r.zoneDist != null && <span className="text-fg-3"> ({r.zoneDist === 0 ? "inside" : pctS(r.zoneDist)})</span>}</td>
                    <td className="r num">{r.invalidation != null ? fmt(r.invalidation) : "—"}</td>
                    <td className="r num font-[600]" style={near ? { color: "var(--warn)" } : undefined}>{pctS(r.invalidationDist)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Method>
          Every value here is Viridia&apos;s stored engine output for each holding&apos;s daily chart: the preferred wave count, its Pattern Confidence, the level that would invalidate it, and the nearest Fibonacci confluence zone. Nothing on this page creates or changes a count. Research output, not a recommendation.
        </Method>
      </Block>
    </>
  );
}

const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 2 : v >= 1 ? 2 : 4 });

// ---------------------------------------------------------------- tax

export function TaxTab({ ws }: { ws: Workspace }) {
  const t = ws.tax;
  const [view, setView] = useState<"position" | "lot">("position");
  if (!t) return (
    <Block title="Tax X-Ray">
      <p className="text-[13.5px] text-fg-2">Add cost per share (and the date acquired) to each line to see unrealized gains and losses, short- and long-term status and each tax lot. Enter a separate line per purchase to keep lots apart.</p>
    </Block>
  );
  const obs: string[] = [];
  obs.push(`${t.positionsWithLoss} position${t.positionsWithLoss === 1 ? "" : "s"} currently contain${t.positionsWithLoss === 1 ? "s" : ""} unrealized losses.`);
  if (t.turningLong30) obs.push(`${t.turningLong30} tax lot${t.turningLong30 === 1 ? "" : "s"} transition${t.turningLong30 === 1 ? "s" : ""} from short-term to long-term status within 30 days.`);
  if (t.lotsWithoutDate) obs.push(`${t.lotsWithoutDate} lot${t.lotsWithoutDate === 1 ? " has" : "s have"} no acquisition date, so ${t.lotsWithoutDate === 1 ? "its" : "their"} holding period is unknown.`);
  if (t.costCoverage < 0.999) obs.push(`Cost basis is known for ${pctU(t.costCoverage, 0)} of invested value.`);
  return (
    <>
      <Metrics items={[
        { k: "Unrealized gain", v: usd(t.gains, true), tone: "pos" },
        { k: "Unrealized loss", v: usd(t.losses, true), tone: t.losses < 0 ? "neg" : undefined },
        { k: "Short-term, net", v: usd(t.shortTerm, true), tone: tone(t.shortTerm), note: "held one year or less" },
        { k: "Long-term, net", v: usd(t.longTerm, true), tone: tone(t.longTerm), note: "held more than one year" },
        { k: "Unknown term", v: usd(t.unknownTerm, true), note: "no acquisition date" },
        { k: "Tax lots", v: String(t.lots.length), note: `${t.byPosition.length} positions` },
      ]} />
      <Block title="Observations" sub="Facts from the lots entered; not trade suggestions">
        <ul className="flex flex-col gap-1 text-[13.5px] text-fg">{obs.map((o) => <li key={o}>{o}</li>)}</ul>
      </Block>
      <Block title="Gain and loss" action={
        <div className="seg" role="tablist" aria-label="Group by">
          <button role="tab" aria-selected={view === "position"} onClick={() => setView("position")}>By position</button>
          <button role="tab" aria-selected={view === "lot"} onClick={() => setView("lot")}>By tax lot</button>
        </div>
      }>
        <div className="overflow-x-auto">
          {view === "position" ? (
            <table className="t dense text-[12.5px]">
              <thead><tr><th>Position</th><th className="r">Cost basis</th><th className="r">Market value</th><th className="r">Gain / loss</th><th className="r">Return</th></tr></thead>
              <tbody>{t.byPosition.map((p) => (
                <tr key={p.symbol}><td><TK s={p.symbol} /></td><td className="r num">{usd(p.basis)}</td><td className="r num">{usd(p.value)}</td>
                  <td className={`r num font-[600] ${p.gain >= 0 ? "text-pos" : "text-neg"}`}>{usd(p.gain, true)}</td><td className="r num">{pctS(p.basis ? p.value / p.basis - 1 : null)}</td></tr>
              ))}</tbody>
            </table>
          ) : (
            <table className="t dense text-[12.5px]">
              <thead><tr><th>Position</th><th>Acquired</th><th className="r">Shares</th><th className="r">Cost / share</th><th className="r">Basis</th><th className="r">Gain / loss</th><th>Term</th><th className="r">Long-term in</th></tr></thead>
              <tbody>{t.lots.map((l, i) => (
                <tr key={i}><td><TK s={l.symbol} /></td><td className="num">{l.acquired ?? "—"}</td><td className="r num">{l.shares.toLocaleString("en-US")}</td><td className="r num">{fmt(l.costPerShare)}</td><td className="r num">{usd(l.basis)}</td>
                  <td className={`r num font-[600] ${l.gain >= 0 ? "text-pos" : "text-neg"}`}>{usd(l.gain, true)}</td>
                  <td>{l.term === "long" ? "Long-term" : l.term === "short" ? "Short-term" : <span className="text-fg-3">Unknown</span>}</td>
                  <td className="r num" style={l.daysToLong != null && l.daysToLong <= 30 ? { color: "var(--warn)" } : undefined}>{l.daysToLong != null ? `${l.daysToLong} days` : "—"}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
        <Method>A lot is long-term once held more than one year from the acquisition date entered. Values use the last close. Harvesting a loss is subject to the wash-sale rule (no substantially identical purchase 30 days before or after). Viridia doesn&apos;t suggest trades; consult a tax professional.</Method>
      </Block>
    </>
  );
}

// ---------------------------------------------------------------- holdings

export function HoldingsTab({ ws, children }: { ws: Workspace; children?: React.ReactNode }) {
  return (
    <>
      <Block title="Holdings" sub={`${ws.positions.length} priced${ws.asOf ? `, closes through ${ws.asOf}` : ""}`}>
        {(ws.unknown.length > 0 || ws.noPrice.length > 0) && (
          <p className="mb-2 text-[12.5px] text-fg-2">
            {ws.unknown.length > 0 && <>Not recognized: <b>{ws.unknown.join(", ")}</b>. </>}
            {ws.noPrice.length > 0 && <>No stored price yet: <b>{ws.noPrice.join(", ")}</b>. </>}
            These are left out of every figure.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="t dense text-[12.5px]">
            <thead><tr><th>Holding</th><th>Class</th><th className="r">Shares</th><th className="r">Price</th><th className="r">Value</th><th className="r">Weight</th><th className="r">Day</th><th className="r">Day P&amp;L</th><th className="r">Unrealized</th><th>Sector (est.)</th></tr></thead>
            <tbody>
              {ws.positions.map((p) => (
                <tr key={p.symbol}>
                  <td><TK s={p.symbol} /><div className="max-w-[200px] truncate text-[11.5px] text-fg-3">{p.name}</div></td>
                  <td className="text-fg-2">{ASSET_LABEL[p.asset]}</td>
                  <td className="r num">{p.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                  <td className="r num">{p.asset === "cash" ? "—" : fmt(p.close)}</td>
                  <td className="r num">{usd(p.value)}</td>
                  <td className="r num font-[600]">{pctU(p.weight)}</td>
                  <td className={`r num ${p.dayChange == null ? "" : p.dayChange > 0 ? "text-pos" : p.dayChange < 0 ? "text-neg" : ""}`}>{pctS(p.dayChange, 2)}</td>
                  <td className={`r num ${tone(p.dayPnl) === "pos" ? "text-pos" : tone(p.dayPnl) === "neg" ? "text-neg" : ""}`}>{usd(p.dayPnl, true)}</td>
                  <td className={`r num ${p.gain == null ? "text-fg-3" : p.gain >= 0 ? "text-pos" : "text-neg"}`}>{p.asset === "cash" ? "—" : p.gain == null ? "—" : `${usd(p.gain, true)} (${pctS(p.gainPct, 0)})`}</td>
                  <td className="text-fg-2">{p.sector}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>
      {children}
    </>
  );
}

/** Targets editor and current-vs-target drift (saved portfolios). */
export function TargetsBlock({ ws, targets, onSave }: { ws: Workspace; targets: Record<string, number>; onSave: (t: Record<string, number>) => Promise<void> }) {
  const syms = [...new Set([...ws.positions.map((p) => p.symbol), ...Object.keys(targets)])];
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(syms.map((s) => [s, targets[s] != null ? String(+(targets[s] * 100).toFixed(2)) : ""])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sum = Object.values(draft).reduce((a, v) => a + (Number(v) || 0), 0);
  const submit = async () => {
    setBusy(true); setErr(null);
    try { await onSave(Object.fromEntries(Object.entries(draft).filter(([, v]) => v.trim() !== "" && isFinite(Number(v))).map(([k, v]) => [k, Math.min(100, Math.max(0, Number(v))) / 100]))); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const drift = ws.drift;
  return (
    <Block title="Current vs target" sub={`Flagged at ${Math.round(DRIFT_BAND * 100)}+ points from target`}>
      <div className="overflow-x-auto">
        <table className="t dense text-[12.5px]">
          <thead><tr><th>Holding</th><th className="r">Current</th><th className="r">Target %</th><th className="r">Difference</th></tr></thead>
          <tbody>
            {syms.map((s) => {
              const d = drift?.find((x) => x.symbol === s);
              return (
                <tr key={s}>
                  <td><TK s={s} /></td>
                  <td className="r num">{pctU(ws.positions.find((p) => p.symbol === s)?.weight ?? 0)}</td>
                  <td className="r"><input className="field h-7 w-20 text-right num" inputMode="decimal" value={draft[s] ?? ""} aria-label={`${s} target percent`} onChange={(e) => setDraft((x) => ({ ...x, [s]: e.target.value.replace(/[^0-9.]/g, "") }))} /></td>
                  <td className={`r num font-[600] ${d?.flag ? (d.diff > 0 ? "text-neg" : "text-pos") : "text-fg-3"}`}>{d ? `${d.diff >= 0 ? "+" : "−"}${Math.abs(d.diff * 100).toFixed(1)} pts` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn pri sm" onClick={submit} aria-busy={busy}>Save targets</button>
        <span className="num text-[12.5px]" style={Math.abs(sum - 100) >= 0.05 && sum > 0 ? { color: "var(--warn)" } : { color: "var(--text-3)" }}>Targets add to {sum.toFixed(1)}%</span>
        {err && <span className="text-[12.5px] text-neg">{err}</span>}
      </div>
      <Method>Drift is research output, not a trade instruction. Rebalancing has tax and cost consequences the X-Ray doesn&apos;t model.</Method>
    </Block>
  );
}
