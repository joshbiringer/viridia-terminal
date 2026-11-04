"use client";

import { useMemo, useState } from "react";
import type { TechnicalPayload } from "@/lib/analysis/technical";
import type { Degree } from "@engine/pivots";
import { CLASS_LABEL, type Component, type ConfluenceClass, type Scenario } from "@engine/confluence";
import { DIVERGENCE_LABEL, DIVERGENCE_MEANING, HIST_STATE_LABEL, RSI_STATE_LABEL, type Divergence } from "@engine/momentum";
import { technicalCommentary } from "@/lib/analysis/technical-text";

const px = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(2) : Math.abs(x) >= 1 ? x.toFixed(2) : x.toPrecision(3));
const pct = (x: number) => `${x > 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
const d10 = (ts: string) => ts.slice(0, 10);
const CLASS_TONE: Record<ConfluenceClass, string> = {
  strong_bullish: "var(--pos)", moderate_bullish: "var(--pos)", neutral: "var(--text-2)", moderate_bearish: "var(--neg)", strong_bearish: "var(--neg)",
};
const STATUS_CHIP: Record<Scenario["status"], string> = { watch: "", active: "acc", confirmed: "pos" };
const IND: Record<Divergence["indicator"], string> = { rsi: "RSI", macd: "MACD", hist: "MACD hist." };

/** A signed bar from −1 to +1 centered on zero. */
function SignedBar({ value }: { value: number }) {
  const w = Math.min(50, Math.abs(value) * 50);
  return (
    <span className="relative inline-block h-1.5 w-full max-w-[140px] rounded-full bg-[var(--hover)]" aria-hidden>
      <span className="absolute top-0 h-full w-px bg-[var(--border-2)]" style={{ left: "50%" }} />
      <span className="absolute top-0 h-full rounded-full" style={{ left: value >= 0 ? "50%" : `${50 - w}%`, width: `${w}%`, background: value >= 0 ? "var(--pos-chart)" : "var(--neg)" }} />
    </span>
  );
}

export function ConfluencePanel({
  tech, degree, symbol, selectedScenario, onSelectScenario, selectedDivergence, onSelectDivergence,
}: {
  tech: TechnicalPayload; degree: Degree; symbol: string;
  selectedScenario: string | null; onSelectScenario: (key: string | null) => void;
  selectedDivergence: string | null; onSelectDivergence: (id: string | null) => void;
}) {
  const c = tech.confluence[degree];
  const [tab, setTab] = useState<"summary" | "evidence" | "divergences" | "commentary">("summary");
  const commentary = useMemo(() => technicalCommentary(tech, degree, symbol), [tech, degree, symbol]);
  const divs = useMemo(() => [...tech.divergences].sort((a, b) => b.confirmedIndex - a.confirmedIndex).slice(0, 12), [tech.divergences]);
  const st = tech.state;

  return (
    <section className="border-t border-line" aria-label="Technical confluence">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
        <div className="flex min-w-0 flex-col">
          <span className="label">Technical confluence · {degree} degree</span>
          <span className="mt-0.5 text-[17px] font-[620] tracking-[-0.015em]" style={{ color: CLASS_TONE[c.classification] }}>{CLASS_LABEL[c.classification]}</span>
        </div>
        <div className="flex min-w-[200px] flex-1 flex-col gap-1" title="Technical alignment index: how well the five layers agree. Not a probability, an expected return or a recommendation.">
          <div className="flex items-baseline justify-between text-[12px] text-fg-3">
            <span>Bearish −100</span>
            <span className="num text-[15px] font-semibold text-fg">{c.index > 0 ? "+" : ""}{c.index}</span>
            <span>+100 Bullish</span>
          </div>
          <span className="relative h-2 rounded-full" style={{ background: "linear-gradient(90deg, var(--neg) 0%, var(--hover) 50%, var(--pos-chart) 100%)" }}>
            <span className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-sm bg-[var(--text)]" style={{ left: `${(c.index + 100) / 2}%` }} />
          </span>
        </div>
        <div className="seg max-w-full overflow-x-auto" role="tablist" aria-label="Confluence view">
          {(["summary", "evidence", "divergences", "commentary"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{k[0].toUpperCase() + k.slice(1)}</button>
          ))}
        </div>
      </div>

      {tab === "summary" && (
        <div className="grid gap-px border-t border-line bg-line lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="bg-panel">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-fg-3">
                  <th className="px-5 py-2 font-medium">Layer</th><th className="px-2 py-2 text-right font-medium">Weight</th>
                  <th className="px-2 py-2 font-medium">Reading</th><th className="px-5 py-2 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                {c.components.map((x: Component) => (
                  <tr key={x.key} className="border-t border-line align-top" title={x.evidence.map((e) => e.text).join("\n")}>
                    <td className="px-5 py-2.5">
                      <div className="font-medium text-fg">{x.label}</div>
                      <div className="mt-0.5 text-[12px] leading-snug text-fg-3">{x.evidence[0]?.text ?? "—"}</div>
                    </td>
                    <td className="num px-2 py-2.5 text-right text-fg-3">{Math.round(x.weight * 100)}%</td>
                    <td className="px-2 py-3"><SignedBar value={x.score} /></td>
                    <td className="num px-5 py-2.5 text-right font-medium" style={{ color: x.contribution > 0.5 ? "var(--pos)" : x.contribution < -0.5 ? "var(--neg)" : "var(--text-3)" }}>
                      {x.available ? `${x.contribution > 0 ? "+" : ""}${x.contribution.toFixed(1)}` : "n/a"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-line px-5 py-3 text-[12px] leading-relaxed text-fg-3">
              <div className="num flex flex-wrap gap-x-4 gap-y-1 text-fg-2">
                <span>RSI(14) <b className="font-medium text-fg">{st.rsi?.toFixed(1) ?? "n/a"}</b> · {RSI_STATE_LABEL[st.rsiState]}</span>
                <span>MACD <b className="font-medium text-fg">{st.macd?.toPrecision(3) ?? "n/a"}</b> / signal {st.signal?.toPrecision(3) ?? "n/a"}</span>
                <span>Histogram: {HIST_STATE_LABEL[st.histState].split(":")[0]}</span>
              </div>
              {c.redundancy && <p className="mt-1.5">{c.redundancy}</p>}
              <p className="mt-1.5">Weights 30/20/15/15/20 are preliminary product assumptions and haven&apos;t been validated out of sample. The index measures alignment, not odds.</p>
            </div>
          </div>

          <div className="flex flex-col bg-panel">
            <div className="px-5 pb-1 pt-3"><span className="label">Wave scenarios</span></div>
            {!c.scenarios.length && (
              <p className="px-5 pb-4 text-[12.5px] text-fg-3">
                The preferred and alternate counts at this degree aren&apos;t in a wave 3 setup, a fifth wave or a C wave, so no scenario applies right now.
              </p>
            )}
            {c.scenarios.map((s) => {
              const key = `${s.id}:${s.direction}`, on = selectedScenario === key;
              const met = s.conditions.filter((x) => x.met).length;
              return (
                <div key={key} className={`border-t border-line px-5 py-3 ${on ? "bg-[var(--hover)]" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{s.title}</span>
                    <span className={`chip ${STATUS_CHIP[s.status]}`}>{s.status === "watch" ? "Watching" : s.status === "active" ? "Active" : "Confirmed"}</span>
                    <span className="num text-[12px] text-fg-3">{met}/{s.conditions.length} conditions</span>
                    <button className="btn sm ml-auto" aria-pressed={on} onClick={() => onSelectScenario(on ? null : key)}>{on ? "Hide levels" : "Show on chart"}</button>
                  </div>
                  <ul className="mt-2 grid gap-1 text-[12.5px] sm:grid-cols-2">
                    {s.conditions.map((x) => (
                      <li key={x.label} className="flex gap-2" title={x.detail}>
                        <span className={`w-3 shrink-0 font-semibold ${x.met ? "text-pos" : "text-fg-3"}`} aria-label={x.met ? "met" : "not met"}>{x.met ? "✓" : "·"}</span>
                        <span className={x.met ? "text-fg-2" : "text-fg-3"}>{x.label}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="num mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                    {s.confirmation && <span title={s.confirmation.basis}><span className="text-fg-3">Confirm</span> <b className="font-medium text-fg">{px(s.confirmation.price)}</b></span>}
                    {s.invalidation && <span title={s.invalidation.basis}><span className="text-fg-3">Invalidate</span> <b className="font-medium" style={{ color: "var(--neg)" }}>{px(s.invalidation.price)}</b></span>}
                    {s.fibZone && <span title={s.fibZone.basis}><span className="text-fg-3">Fib zone</span> <b className="font-medium" style={{ color: "var(--fib)" }}>{px(s.fibZone.low)}–{px(s.fibZone.high)}</b></span>}
                    {s.targets.slice(0, 3).map((t) => <span key={t.basis} title={t.basis}><span className="text-fg-3">Target</span> <b className="font-medium text-fg">{px(t.price)}</b></span>)}
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-fg-2">{s.interpretation}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "evidence" && (
        <div className="grid gap-px border-t border-line bg-line md:grid-cols-2">
          {([["Supporting", c.supporting], ["Conflicting", c.conflicting]] as const).map(([title, list]) => (
            <div key={title} className="bg-panel px-5 py-3">
              <span className="label">{title} evidence</span>
              {!list.length && <p className="mt-2 text-[12.5px] text-fg-3">None.</p>}
              <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px]">
                {list.map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: e.lean === "bullish" ? "var(--pos-chart)" : "var(--neg)" }} aria-hidden />
                    <span className="text-fg-2"><span className="text-fg-3">{c.components.find((x) => x.key === e.component)?.label}: </span>{e.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {tab === "divergences" && (
        <div className="overflow-x-auto border-t border-line">
          {!divs.length ? <p className="px-5 py-4 text-[12.5px] text-fg-3">No divergences detected on this timeframe. Detection uses 5-bar swing pivots, 5–60 bars apart, with ATR-scaled minimum moves.</p> : (
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead>
                <tr className="text-left text-fg-3">
                  <th className="px-5 py-2 font-medium">Divergence</th><th className="px-2 py-2 font-medium">Indicator</th><th className="px-2 py-2 font-medium">Pivots</th>
                  <th className="px-2 py-2 text-right font-medium">Price</th><th className="px-2 py-2 text-right font-medium">Indicator Δ</th><th className="px-5 py-2 font-medium">Confirmed</th>
                </tr>
              </thead>
              <tbody>
                {divs.map((d) => {
                  const on = selectedDivergence === d.id;
                  return (
                    <tr key={d.id} className={`cursor-pointer border-t border-line ${on ? "bg-[var(--hover)]" : "hover:bg-[var(--hover)]"}`}
                      onClick={() => onSelectDivergence(on ? null : d.id)} onMouseEnter={() => !selectedDivergence && onSelectDivergence(d.id)}
                      title={DIVERGENCE_MEANING[d.type]}>
                      <td className="px-5 py-2">
                        <span className="font-medium" style={{ color: d.direction === "bullish" ? "var(--pos)" : "var(--neg)" }}>{DIVERGENCE_LABEL[d.type]}</span>
                        {d.status === "developing" && <span className="chip warn ml-2">Developing</span>}
                      </td>
                      <td className="px-2 py-2 text-fg-2">{IND[d.indicator]}</td>
                      <td className="num px-2 py-2 text-fg-2">{d10(d.first.ts)} → {d10(d.second.ts)}</td>
                      <td className="num px-2 py-2 text-right">{pct(d.priceChangePct)}</td>
                      <td className="num px-2 py-2 text-right">{d.indicatorChange > 0 ? "+" : ""}{d.indicator === "rsi" ? d.indicatorChange.toFixed(1) : d.indicatorChange.toPrecision(3)}</td>
                      <td className="num px-5 py-2 text-fg-2">{d.status === "developing" ? "—" : d10(d.confirmedTs)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="border-t border-line px-5 py-2.5 text-[12px] text-fg-3">Confirmation is the close of the bar that completed the second pivot (five bars after it); it is never backdated to the pivot. Developing divergences use a swing that can still change.</p>
        </div>
      )}

      {tab === "commentary" && (
        <div className="grid gap-px border-t border-line bg-line md:grid-cols-2">
          {commentary.map((s) => (
            <div key={s.key} className={`bg-panel px-5 py-3 ${s.key === "overall" ? "md:col-span-2" : ""}`}>
              <span className="label">{s.title}</span>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{s.text}</p>
            </div>
          ))}
          <p className="bg-panel px-5 py-2.5 text-[12px] text-fg-3 md:col-span-2">Written from the engine&apos;s calculated values only: no count, level or divergence here is estimated. Research output, not a recommendation.</p>
        </div>
      )}
    </section>
  );
}
