"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { fmtDollars, pct } from "@/lib/market-data/snapshot";
import { stockHref } from "@/lib/format";
import { PATTERN_LABEL, SETUP_LABEL, type CandidatePattern, type SetupKind } from "@/lib/analysis/candidates";
import { FUNDS_BUCKET, UNCLASSIFIED, type Position, type XRay } from "@/lib/portfolio/xray";

const EXAMPLE = `symbol,shares,avg cost,acquired
QQQ,120,410.00,2024-03-15
NVDA,400,118.50,2025-02-10
MSFT,90,402.10,2023-11-01
VGT,60,520.00,2025-06-20
JPM,75,248.00,2025-09-05
XOM,110,121.40,2024-08-12
TLT,150,94.20,2025-01-22`;

const pp = (x: number | null, d = 1) => (x == null ? "—" : pct(x, d));
const w = (x: number) => `${(x * 100).toFixed(1)}%`;

export function PortfolioXRay() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [r, setR] = useState<XRay | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (input = text) => {
    setBusy(true); setErrors([]);
    try {
      const res = await fetch("/api/portfolio/xray", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: input }) });
      const j = await res.json();
      setErrors(j.errors ?? []);
      setR(j.result ?? null);
    } catch {
      setErrors(["The analysis couldn't be run. Check your connection and try again."]);
    } finally { setBusy(false); }
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const t = (await f.text()).slice(0, 20_000);
    setText(t);
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="card">
        <div className="card-h">
          <div>
            <h2 className="card-t">Holdings</h2>
            <p className="card-s mt-0.5">One per line: symbol, shares, and optionally average cost per share and date acquired. A CSV export with a header row works too.</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">
          <textarea
            className="field min-h-[160px] w-full font-mono text-[13px]" value={text} onChange={(e) => setText(e.target.value)}
            placeholder={"AAPL, 100, 185.20, 2024-05-01\nVTI 250\nNVDA,40"} aria-label="Holdings" spellCheck={false}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn pri" onClick={() => run()} disabled={!text.trim()} aria-busy={busy}>Run X-Ray</button>
            <button className="btn" onClick={() => fileRef.current?.click()}>Upload CSV</button>
            <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            <button className="btn ghost" onClick={() => { setText(EXAMPLE); run(EXAMPLE); }}>Try an example portfolio</button>
            <span className="ml-auto text-[12px] text-fg-3">Analyzed on request and never stored.</span>
          </div>
          {errors.length > 0 && (
            <ul className="rounded-[var(--r-md)] px-3 py-2 text-[13px] text-neg" style={{ background: "var(--neg-soft)" }} role="alert">
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
        </div>
      </section>

      {r && <Results r={r} />}
    </div>
  );
}

function Results({ r }: { r: XRay }) {
  const c = r.concentration;
  return (
    <>
      {(r.unknown.length > 0 || r.noPrice.length > 0) && (
        <p className="rounded-[var(--r-md)] border border-line px-4 py-2.5 text-[13px] text-fg-2">
          {r.unknown.length > 0 && <>Not recognized: <b>{r.unknown.join(", ")}</b>. </>}
          {r.noPrice.length > 0 && <>No stored price yet: <b>{r.noPrice.join(", ")}</b> (opening each one&apos;s page fetches its history). </>}
          These are left out of the figures.
        </p>
      )}

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-lg)] border border-line bg-line md:grid-cols-4">
        <Stat label="Market value" value={fmtDollars(r.total)} note={`${r.positions.length} holdings priced${r.asOf ? `, close ${r.asOf.slice(0, 10)}` : ""}`} />
        <Stat label="Largest position" value={c.top ? `${c.top.symbol} ${w(c.top.weight)}` : "—"} note={`Top 5: ${w(c.top5)} of value`} />
        <Stat label="Effective holdings" value={c.effective ? c.effective.toFixed(1) : "—"} note="1 ÷ sum of squared weights" />
        <Stat label="Beta to S&P 500" value={r.risk.beta != null ? r.risk.beta.toFixed(2) : "—"} note="SPY, last year of sessions" />
        <Stat label="Volatility" value={r.risk.vol != null ? `${(r.risk.vol * 100).toFixed(1)}%` : "—"} note="annualized, today's weights" />
        <Stat label="Largest drawdown" value={pp(r.risk.drawdown)} note="past year, today's weights" />
        <Stat label="3-month return" value={pp(r.risk.r3m)} note={`SPY ${pp(r.risk.spy3m)}`} />
        <Stat label="Mix" value={`${w(r.mix.stocks)} stocks`} note={`${w(r.mix.etfs)} ETFs${r.mix.other ? `, ${w(r.mix.other)} other` : ""}`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="card-h"><h2 className="card-t">Concentration</h2></div>
          <div className="flex flex-col gap-2 px-5 py-4 text-[13.5px] text-fg-2">
            {c.over20.length > 0 && <Flag tone="neg">{c.over20.map((p) => `${p.symbol} (${w(p.weight)})`).join(", ")} {c.over20.length === 1 ? "is" : "are"} over 20% of the portfolio.</Flag>}
            {c.over10.filter((p) => p.weight <= 0.2).length > 0 && <Flag tone="warn">{c.over10.filter((p) => p.weight <= 0.2).map((p) => `${p.symbol} (${w(p.weight)})`).join(", ")} {c.over10.filter((p) => p.weight <= 0.2).length === 1 ? "is" : "are"} over 10%.</Flag>}
            {c.over10.length === 0 && <Flag tone="pos">No single holding is over 10% of value.</Flag>}
            <p>The portfolio behaves like about <b className="num text-fg">{c.effective.toFixed(1)}</b> equally weighted positions.</p>
            <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-hover" aria-hidden>
              {r.positions.slice(0, 12).map((p, i) => <i key={p.symbol} style={{ width: `${p.weight * 100}%`, background: `color-mix(in oklab, var(--brand) ${100 - i * 7}%, var(--panel))` }} title={`${p.symbol} ${w(p.weight)}`} />)}
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-h"><h2 className="card-t">Positions that move together</h2></div>
          <div className="px-5 py-4 text-[13.5px] text-fg-2">
            {r.pairs.length ? (
              <ul className="flex flex-col gap-1.5">
                {r.pairs.map((x) => (
                  <li key={`${x.a}-${x.b}`} className="flex items-baseline gap-3">
                    <span className="font-medium text-fg">{x.a} &amp; {x.b}</span>
                    <span className="num ml-auto">{x.corr.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            ) : <p>Needs at least two holdings with 60 shared sessions.</p>}
            <p className="mt-3 text-[12px] text-fg-3">Correlation of daily returns over the past year. Above about 0.8, two holdings add little diversification to each other. Fund look-through (what QQQ and VGT hold) isn&apos;t in the data plan yet.</p>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-h">
          <h2 className="card-t">Sector exposure</h2>
          <span className="card-s">Stocks by the sector of their SEC industry code</span>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4 text-[13.5px] text-fg-2">
          {r.sectors.filter((s) => s.sector !== FUNDS_BUCKET && s.sector !== UNCLASSIFIED && s.weight > 0.35).map((s) => (
            <Flag key={s.sector} tone="warn">{s.sector} is {w(s.weight)} of the portfolio.</Flag>
          ))}
          <ul className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            {r.sectors.map((s) => (
              <li key={s.sector} className="flex items-center gap-3">
                <span className={`min-w-0 flex-1 truncate ${s.sector === FUNDS_BUCKET || s.sector === UNCLASSIFIED ? "text-fg-3" : "text-fg"}`} title={s.symbols.join(", ")}>{s.sector}</span>
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-hover" aria-hidden><i className="block h-full bg-brand" style={{ width: `${Math.min(1, s.weight) * 100}%` }} /></span>
                <span className="num w-12 text-right font-medium">{w(s.weight)}</span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-fg-3">Sectors are mapped from each company&apos;s SEC SIC code, an approximation of the usual 11 sectors. Funds are one bucket because their holdings aren&apos;t looked through yet.</p>
        </div>
      </section>

      <section className="card">
        <div className="card-h"><h2 className="card-t">Holdings</h2></div>
        <div className="overflow-x-auto">
          <table className="t dense">
            <thead>
              <tr>
                <th>Symbol</th><th className="r">Weight</th><th className="r hidden sm:table-cell">Value</th><th className="r">Today</th>
                <th className="r hidden md:table-cell">3 months</th><th className="r hidden md:table-cell">Beta</th>
                <th className="r hidden lg:table-cell">Unrealized</th><th>Wave structure</th><th className="hidden lg:table-cell">Setup</th>
              </tr>
            </thead>
            <tbody>
              {r.positions.map((p) => <Row key={p.symbol} p={p} />)}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="card-h"><h2 className="card-t">Structure across the portfolio</h2></div>
          <div className="flex flex-col gap-2 px-5 py-4 text-[13.5px] text-fg-2">
            <p>
              Preferred daily counts expect the current move to be up for <b className="text-pos">{w(r.structure.up)}</b> of value and down for{" "}
              <b className="text-neg">{w(r.structure.down)}</b>{r.structure.none > 0 && <>; no count yet for {w(r.structure.none)}</>}.
            </p>
            {r.structure.nearLevel.length > 0 && <Flag tone="warn">Within 3% of the count&apos;s invalidation level: {r.structure.nearLevel.map((p) => p.symbol).join(", ")}.</Flag>}
            {r.structure.setups.length > 0 && <p>Setups right now: {r.structure.setups.map((p) => `${p.symbol} (${p.ctx.setup_side}, ${SETUP_LABEL[p.ctx.setup_kind as SetupKind] ?? p.ctx.setup_kind})`).join(" · ")}.</p>}
          </div>
        </section>

        <section className="card">
          <div className="card-h"><h2 className="card-t">Tax lots</h2></div>
          <div className="flex flex-col gap-2 px-5 py-4 text-[13.5px] text-fg-2">
            {r.tax ? (
              <>
                <p>Unrealized {r.tax.gain >= 0 ? "gain" : "loss"} across the {r.tax.costKnown} holdings with a cost: <b className={r.tax.gain >= 0 ? "text-pos" : "text-neg"}>{fmtDollars(r.tax.gain)}</b>.</p>
                {r.tax.losses.length > 0 && <p>Holdings below cost: {r.tax.losses.map((p) => `${p.symbol} (${fmtDollars(p.gain)})`).join(", ")}. Harvesting a loss is subject to wash-sale rules.</p>}
                {(r.tax.shortTerm > 0 || r.tax.longTerm > 0) && <p>By date acquired: {r.tax.longTerm} held over a year, {r.tax.shortTerm} a year or less.</p>}
              </>
            ) : <p>Add average cost per share (and optionally the date acquired) to see unrealized gains, losses and holding periods.</p>}
          </div>
        </section>
      </div>

      <section className="rounded-[var(--r-lg)] border border-dashed border-line px-5 py-4 text-[13px] text-fg-2">
        <b className="font-medium text-fg">Not in the X-Ray yet.</b> Geographic and factor exposure, fund look-through (the overlap inside QQQ and VGT), and
        income all need data Viridia doesn&apos;t have yet. They&apos;ll appear here when it does, rather than as estimates. Portfolio history uses today&apos;s
        weights applied to each holding&apos;s past returns; it is not the account&apos;s actual record.
      </section>
    </>
  );
}

function Row({ p }: { p: Position }) {
  const g = p.ctx;
  const count = g.glance_pattern
    ? `${PATTERN_LABEL[g.glance_pattern as CandidatePattern] ?? g.glance_pattern} ${g.glance_complete ? "complete" : `wave ${g.glance_wave}`} ${g.glance_wave_dir === "up" ? "↑" : "↓"}`
    : null;
  return (
    <tr>
      <td><Link href={stockHref(p.symbol)} className="tk hover:text-brand">{p.symbol}</Link><div className="max-w-[180px] truncate text-[12px] text-fg-3">{p.name}</div></td>
      <td className="r num font-medium">{w(p.weight)}</td>
      <td className="r num hidden text-fg-2 sm:table-cell">{fmtDollars(p.value)}</td>
      <td className={`r num ${p.dayChange == null ? "" : p.dayChange >= 0 ? "text-pos" : "text-neg"}`}>{pp(p.dayChange, 2)}</td>
      <td className="r num hidden md:table-cell">{pp(p.r3m)}</td>
      <td className="r num hidden text-fg-2 md:table-cell">{p.beta != null ? p.beta.toFixed(2) : "—"}</td>
      <td className={`r num hidden lg:table-cell ${p.gain == null ? "text-fg-3" : p.gain >= 0 ? "text-pos" : "text-neg"}`}>
        {p.gain == null ? "—" : `${fmtDollars(p.gain)} (${pp(p.gainPct, 0)})`}{p.term ? <span className="text-fg-3"> · {p.term === "long" ? "LT" : "ST"}</span> : null}
      </td>
      <td className="whitespace-nowrap text-[13px]">
        {count ?? <span className="text-fg-3">No count yet</span>}
        {g.weekly_dir && g.glance_wave_dir && <span className="text-[12px] text-fg-3"> · weekly {g.weekly_dir === g.glance_wave_dir ? "agrees" : "differs"}</span>}
      </td>
      <td className="hidden whitespace-nowrap text-[13px] lg:table-cell">
        {g.setup_side ? <span className={g.setup_side === "buy" ? "text-pos" : "text-neg"}>{g.setup_side === "buy" ? "Buy" : "Sell"} · {SETUP_LABEL[g.setup_kind as SetupKind] ?? g.setup_kind}</span> : <span className="text-fg-3">—</span>}
      </td>
    </tr>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-panel px-4 py-3.5">
      <div className="text-[12.5px] text-fg-3">{label}</div>
      <div className="num mt-0.5 text-[19px] font-[650] tracking-[-0.02em]">{value}</div>
      <div className="text-[12px] text-fg-3">{note}</div>
    </div>
  );
}

function Flag({ tone, children }: { tone: "pos" | "neg" | "warn"; children: React.ReactNode }) {
  return <p className="flex gap-2"><span aria-hidden style={{ color: `var(--${tone})` }}>●</span><span>{children}</span></p>;
}

