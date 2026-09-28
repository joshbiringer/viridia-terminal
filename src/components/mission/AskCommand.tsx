"use client";

import Link from "next/link";
import { useState } from "react";
import { ViridiaMark } from "@/components/ViridiaMark";
import { Icon } from "@/components/Icon";
import { fmtPrice } from "@/lib/market-data/bars";
import { TREND_LABEL } from "@/lib/market-data/snapshot";
import { SETUP_LABEL, type SetupKind } from "@/lib/analysis/candidates";
import { SUGGESTED_PROMPTS, fmtPct, returns, routeCommand, waveShort, type Command, type SecurityPreview } from "@/lib/analysis/mission";
import { TickerButton, loadPreview, useDrawer } from "./SecurityDrawer";

export interface Line { symbol?: string; text: string }

type Result =
  | { kind: "lines"; title: string; lines: Line[]; empty: string; more?: { href: string; label: string } }
  | { kind: "compare"; a: SecurityPreview | { error: string }; b: SecurityPreview | { error: string } }
  | { kind: "loading"; title: string }
  | { kind: "unknown" };

/**
 * The Ask Viridia command line on Mission Control. Questions are routed to answers built from
 * Viridia's stored data (market pulse, breadth, structure changes, setups, security previews); it
 * doesn't generate forecasts or answer outside that data.
 */
export function AskCommand({ market, improving, watchlist, setups }: {
  market: Line[]; improving: Line[]; watchlist: Line[] | null; setups: Line[];
}) {
  const [draft, setDraft] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const { open } = useDrawer();

  const run = (text: string) => {
    const cmd: Command = routeCommand(text);
    setAsked(text);
    switch (cmd.kind) {
      case "market": return setResult({ kind: "lines", title: "Today's market", lines: market, empty: "Market data couldn't be loaded." });
      case "improving": return setResult({ kind: "lines", title: "Improving structures", lines: improving,
        empty: "No security's count turned up or gained a buy setup between the last two recorded sessions.",
        more: { href: "/scanner?s=wave3&score=58&dv=25000000&sort=confidence", label: "Wave 3 in progress, medium confidence or higher" } });
      case "watchlist": return setResult(watchlist === null
        ? { kind: "lines", title: "Watchlist changes", lines: [], empty: "Sign in and add securities to a watchlist to track their changes here.", more: { href: "/signin?next=/terminal", label: "Sign in" } }
        : { kind: "lines", title: "Watchlist changes", lines: watchlist, empty: "Nothing on your watchlist changed structure between the last two sessions.", more: { href: "/watchlist", label: "Open watchlist" } });
      case "setups": return setResult({ kind: "lines", title: "Setups to review", lines: setups, empty: "No liquid setup at 1.5 : 1 or better right now.", more: { href: "/setups", label: "All setups" } });
      case "ticker": setResult(null); return open(cmd.symbol);
      case "compare": {
        setResult({ kind: "loading", title: `${cmd.symbols[0]} and ${cmd.symbols[1]}` });
        Promise.all(cmd.symbols.map(loadPreview)).then(([a, b]) => setResult({ kind: "compare", a, b }));
        return;
      }
      default: return setResult({ kind: "unknown" });
    }
  };
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (draft.trim()) { run(draft.trim()); setDraft(""); } };

  return (
    <section className="card overflow-hidden" aria-label="Ask Viridia">
      <form onSubmit={submit} className="flex items-center gap-3 px-4 py-3">
        <ViridiaMark size={18} className="shrink-0 text-brand" />
        <input
          className="h-9 min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-fg-3"
          value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask Viridia: explain the market, compare two tickers, or type a ticker" aria-label="Ask Viridia"
        />
        <button type="submit" className="btn pri sm" disabled={!draft.trim()}>Ask</button>
      </form>
      <div className="flex flex-wrap gap-1.5 border-t border-line px-4 py-2.5">
        {SUGGESTED_PROMPTS.map((p) => (
          <button key={p} onClick={() => run(p)} aria-pressed={asked === p}
            className={`inline-flex h-7 items-center rounded-full border px-3 text-[12.5px] transition-colors ${asked === p ? "border-brand bg-[var(--accent-bg)] text-brand" : "border-line text-fg-2 hover:border-line-2 hover:text-fg"}`}>
            {p}
          </button>
        ))}
      </div>
      {result && (
        <div className="border-t border-line bg-panel-2 px-4 py-3.5" aria-live="polite">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[12px] text-fg-3">{asked}</span>
            <button className="btn ghost sm ml-auto px-2" onClick={() => { setResult(null); setAsked(null); }} aria-label="Clear answer"><Icon name="x" /></button>
          </div>
          <ResultView r={result} />
          <p className="mt-3 text-[11.5px] text-fg-3">Built from Viridia&apos;s stored prices, breadth and wave counts. Not a forecast or a recommendation.</p>
        </div>
      )}
    </section>
  );
}

function ResultView({ r }: { r: Result }) {
  if (r.kind === "loading") return <p className="text-[13.5px] text-fg-2">Loading {r.title}…</p>;
  if (r.kind === "unknown") {
    return (
      <div className="text-[13.5px] leading-relaxed text-fg-2">
        <h3 className="mb-1 font-semibold text-fg">That one isn&apos;t something Viridia can answer from its data</h3>
        Try one of the prompts above, type a ticker to preview it, or &ldquo;compare&rdquo; two tickers. For a single security&apos;s wave
        count, open it and use Ask Viridia there.
      </div>
    );
  }
  if (r.kind === "lines") {
    return (
      <div>
        <h3 className="mb-1.5 text-[14px] font-semibold">{r.title}</h3>
        {r.lines.length ? (
          <ul className="flex flex-col gap-1.5 text-[13.5px] leading-snug">
            {r.lines.map((l, i) => (
              <li key={i} className="text-fg-2">
                {l.symbol && <TickerButton symbol={l.symbol} className="tk mr-2 text-fg hover:text-brand" />}
                {l.text}
              </li>
            ))}
          </ul>
        ) : <p className="text-[13.5px] text-fg-2">{r.empty}</p>}
        {r.more && <Link href={r.more.href} className="mt-2 inline-block text-[13px] text-brand hover:underline">{r.more.label} →</Link>}
      </div>
    );
  }
  const cols = [r.a, r.b];
  const ok = (x: SecurityPreview | { error: string }): x is SecurityPreview => !("error" in x);
  const rows: [string, (p: SecurityPreview) => string][] = [
    ["Price", (p) => fmtPrice(p.close)],
    ["Day", (p) => fmtPct(returns(p).d1)],
    ["1 week", (p) => fmtPct(returns(p).w1)],
    ["1 month", (p) => fmtPct(returns(p).m1)],
    ["Trend", (p) => (p.trend ? TREND_LABEL[p.trend] : "—")],
    ["Daily count", (p) => (p.daily ? waveShort(p.daily.pattern, p.daily.complete, p.daily.wave, p.daily.wave_dir) ?? "—" : "—")],
    ["Pattern Confidence", (p) => (p.daily?.score != null ? String(p.daily.score) : "—")],
    ["Weekly count", (p) => (p.weekly ? waveShort(p.weekly.pattern, p.weekly.complete, p.weekly.wave, p.weekly.wave_dir) ?? "—" : "—")],
    ["Setup", (p) => (p.setup ? `${p.setup.side === "buy" ? "Buy" : "Sell"} · ${SETUP_LABEL[p.setup.kind as SetupKind] ?? p.setup.kind} · ${p.setup.rr.toFixed(1)} : 1` : "None")],
    ["Nearest Fib zone", (p) => (p.zone ? `${fmtPrice(p.zone.low)}–${fmtPrice(p.zone.high)} (${fmtPct(p.zone.distancePct)})` : "—")],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="t dense text-[13px]">
        <thead><tr><th />{cols.map((c, i) => <th key={i} className="r">{ok(c) ? <TickerButton symbol={c.symbol} className="tk text-fg hover:text-brand" /> : "—"}</th>)}</tr></thead>
        <tbody>
          {rows.map(([k, f]) => (
            <tr key={k}><td className="text-fg-3">{k}</td>{cols.map((c, i) => <td key={i} className="r num">{ok(c) ? f(c) : c.error}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
