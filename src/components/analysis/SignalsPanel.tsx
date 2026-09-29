import Link from "next/link";
import { SETUP_LABEL } from "@/lib/analysis/candidates";
import { SIGNALS_METHOD, type SignalDim, type Tone } from "@/lib/analysis/signals";
import type { SymbolTrial } from "@/lib/analysis/track-record";

const TONE: Record<Tone, string> = { pos: "var(--pos)", neg: "var(--neg)", warn: "var(--warn)", neutral: "var(--text)", na: "var(--text-3)" };

/**
 * Viridia Intelligence: one row of context (Structure, Wave, Fibonacci, Momentum, Regime, Risk)
 * instead of a single rating, plus this security's own setup history.
 */
export function SignalsPanel({ symbol, dims, trials }: { symbol: string; dims: SignalDim[]; trials: SymbolTrial[] }) {
  const done = trials.filter((t) => t.outcome === "target" || t.outcome === "stop" || t.outcome === "expired");
  const hits = done.filter((t) => t.outcome === "target").length;
  const avgR = done.length ? done.reduce((a, t) => a + (t.r ?? 0), 0) / done.length : null;
  const recent = trials.slice(0, 4);
  return (
    <section className="card" aria-labelledby="signals-title">
      <div className="card-h">
        <div>
          <h2 id="signals-title" className="card-t">Viridia Intelligence</h2>
          <p className="card-s mt-0.5">Context across dimensions, not a rating</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 xl:grid-cols-6">
        {dims.map((d) => (
          <div key={d.key} className="flex flex-col gap-1 bg-panel px-4 py-3.5" title={d.rule}>
            <span className="label">{d.label}</span>
            <span className="text-[15px] font-[620] tracking-[-0.015em]" style={{ color: TONE[d.tone] }}>{d.state}</span>
            <span className="text-[12px] leading-snug text-fg-3">{d.detail}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-line px-5 py-3 text-[12.5px] text-fg-2">
        <span className="font-medium text-fg">{symbol} setup history</span>
        {trials.length === 0 ? (
          <span className="text-fg-3">Not replayed yet; the track record fills in most-traded securities first.</span>
        ) : (
          <>
            <span>
              {done.length} resolved: <b className="num">{hits}</b> reached target first
              {avgR != null && <>, average <b className={`num ${avgR >= 0 ? "text-pos" : "text-neg"}`}>{avgR >= 0 ? "+" : "−"}{Math.abs(avgR).toFixed(2)}R</b></>}
              {done.length < 10 && <span className="text-fg-3"> (small sample)</span>}
            </span>
            <span className="text-fg-3">
              Latest: {recent.map((t) => `${t.ts.slice(5, 10)} ${t.side === "buy" ? "bullish" : "bearish"} ${SETUP_LABEL[t.kind] ?? t.kind} → ${t.outcome === "stop" ? "invalidated" : t.outcome === "target" ? "reached target" : t.outcome}`).join(" · ")}
            </span>
          </>
        )}
        <Link href="/setups/track-record" className="ml-auto text-brand hover:underline">Track record</Link>
      </div>
      <div className="src"><span><b>Method</b>{SIGNALS_METHOD}</span></div>
    </section>
  );
}
