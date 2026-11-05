"use client";

import { PATTERN_LABEL, type CandidatePattern } from "@engine/candidates";
import { CLASS_LABEL, type ConfluenceClass } from "@engine/confluence";
import { DIVERGENCE_LABEL, HIST_STATE_LABEL, RSI_STATE_LABEL } from "@engine/momentum";
import type { ChartCount } from "@/lib/analysis/technical";
import { useDegree } from "./DegreeContext";
import { useResearch } from "./ResearchContext";

const px = (x: number) => (Math.abs(x) >= 1 ? x.toFixed(2) : x.toPrecision(3));
const pct = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toFixed(1)}%`;
const CLASS_TONE: Record<ConfluenceClass, string> = {
  strong_bullish: "var(--pos)", moderate_bullish: "var(--pos)", neutral: "var(--text-2)", moderate_bearish: "var(--neg)", strong_bearish: "var(--neg)",
};
const KIND: Record<string, { label: string; color: string }> = {
  confirmation: { label: "Confirmation", color: "var(--brand)" },
  invalidation: { label: "Invalidation", color: "var(--neg)" },
  target: { label: "Target", color: "var(--pos)" },
  support: { label: "Support", color: "var(--text-2)" },
  resistance: { label: "Resistance", color: "var(--text-2)" },
};
const STATUS: Record<string, string> = { watch: "Watch", active: "Active", confirmed: "Confirmed" };

function CountRow({ c, label, on, onPick, disabled }: { c: ChartCount | null; label: string; on: boolean; onPick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onPick} disabled={disabled || !c} aria-pressed={on}
      className={`flex w-full flex-col gap-0.5 rounded-[var(--r-md)] border px-3 py-2 text-left transition-colors disabled:opacity-50 ${on ? "border-brand bg-[var(--accent-bg)]" : "border-line hover:bg-hover"}`}>
      <span className="flex items-center gap-2 text-[11.5px] text-fg-3">
        {label}{c?.score != null && <span className="num ml-auto">Confidence {c.score}</span>}
      </span>
      {c ? (
        <>
          <span className="text-[13.5px] font-[600]">
            {PATTERN_LABEL[c.pattern as CandidatePattern] ?? c.pattern} {c.direction === "up" ? "up" : "down"}{c.complete ? ", complete" : ""}
          </span>
          <span className="text-[12px] text-fg-2">
            Next: wave {c.next.label} {c.next.direction}{c.next.hold != null ? ` · must hold ${px(c.next.hold)}` : ""}
          </span>
        </>
      ) : <span className="text-[12.5px] text-fg-3">No count at this degree</span>}
    </button>
  );
}

/**
 * The levels rail beside the chart, synced to it: the preferred and alternate counts at the page's
 * degree (choosing one redraws the chart), every key level with its distance from the close
 * (confirmation, invalidation, targets, support and resistance), the confluence reading and the
 * momentum state. It states what the structure implies and where it would be wrong; it does not
 * forecast.
 */
export function ResearchRail() {
  const research = useResearch();
  const { degree } = useDegree("intermediate");
  const tech = research?.tech ?? null;

  if (!tech) {
    return (
      <aside className="card flex flex-col gap-3 p-4" aria-label="Levels" aria-busy="true">
        <span className="text-[12.5px] text-fg-3">Loading the chart&apos;s analysis…</span>
        {[0, 1, 2, 3, 4].map((i) => <span key={i} className="skel h-9" />)}
      </aside>
    );
  }
  const c = tech.confluence[degree];
  const w = tech.waves[degree];
  const mode = research!.countMode;
  const close = c.close;
  const levels = [...c.keyLevels].sort((a, b) => b.price - a.price);
  const at = levels.findIndex((l) => close != null && l.price < close);
  const rows: ({ kind: string; label: string; price: number } | { kind: "close"; price: number })[] = [...levels];
  if (close != null) rows.splice(at < 0 ? rows.length : at, 0, { kind: "close", price: close });
  const lastDiv = [...tech.divergences].sort((a, b) => b.confirmedIndex - a.confirmedIndex)[0];
  const tfLabel = tech.timeframe === "1d" ? "Daily" : tech.timeframe === "1w" ? "Weekly" : tech.timeframe === "1mo" ? "Monthly" : tech.timeframe;

  return (
    <aside className="card flex flex-col" aria-label="Levels">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h3 className="card-t">Levels</h3>
        <span className="text-[12px] text-fg-3">{tfLabel} · {degree} degree · synced with chart</span>
      </div>

      <div className="flex flex-col gap-1.5 border-b border-line p-3">
        <CountRow c={w.preferred} label="Primary count" on={mode === "preferred"} onPick={() => research!.setCountMode("preferred")} />
        <CountRow c={w.alternate} label="Alternate count" on={mode === "alternate"} onPick={() => research!.setCountMode("alternate")} />
      </div>

      <div className="border-b border-line">
        <p className="flex items-baseline px-4 pb-1 pt-2.5 text-[12px] text-fg-3">Key levels<span className="ml-auto">From close</span></p>
        {rows.length > (close != null ? 1 : 0) ? (
          <ul className="pb-1.5">
            {rows.map((l, i) => l.kind === "close" ? (
              <li key="close" className="mx-2 my-0.5 flex items-center gap-2 rounded-[var(--r-sm)] bg-hover px-2 py-1 text-[12.5px]">
                <span className="font-medium">Last close</span><span className="num ml-auto font-[620]">{px(l.price)}</span><span className="w-[52px]" />
              </li>
            ) : (
              <li key={i} className="flex items-center gap-2 px-4 py-1 text-[12.5px]" title={"label" in l ? l.label : undefined}>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: KIND[l.kind]?.color ?? "var(--text-3)" }} aria-hidden />
                <span className="min-w-0 truncate text-fg-2">{KIND[l.kind]?.label ?? l.kind}<span className="text-fg-3"> · {"label" in l ? l.label : ""}</span></span>
                <span className="num ml-auto">{px(l.price)}</span>
                <span className="num w-[52px] text-right text-[11.5px] text-fg-3">{close ? pct(l.price / close - 1) : ""}</span>
              </li>
            ))}
          </ul>
        ) : <p className="px-4 pb-3 text-[12.5px] text-fg-3">No confirmation or invalidation level at this degree yet.</p>}
      </div>

      <div className="flex flex-col gap-2 border-b border-line px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[12px] text-fg-3">Confluence</span>
          <span className="text-[13.5px] font-[620]" style={{ color: CLASS_TONE[c.classification] }}>{CLASS_LABEL[c.classification]}</span>
          <span className="num ml-auto text-[13px] font-[620]">{c.index > 0 ? "+" : ""}{c.index}</span>
        </div>
        <span className="relative h-1.5 rounded-full" style={{ background: "linear-gradient(90deg, var(--neg) 0%, var(--hover) 50%, var(--pos-chart) 100%)" }} aria-hidden>
          <span className="absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded-sm bg-[var(--text)]" style={{ left: `${(c.index + 100) / 2}%` }} />
        </span>
        {c.scenarios.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1">
            {c.scenarios.map((s) => (
              <li key={s.id} className="text-[12px] leading-snug">
                <span className="font-medium" style={{ color: s.direction === "bullish" ? "var(--pos)" : "var(--neg)" }}>{s.title}</span>
                <span className="text-fg-3"> · {STATUS[s.status]}</span>
                {(s.confirmation || s.invalidation) && (
                  <span className="num block text-fg-3">
                    {s.confirmation && <>Confirms past {px(s.confirmation.price)}</>}{s.confirmation && s.invalidation && " · "}{s.invalidation && <>wrong past {px(s.invalidation.price)}</>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-1 px-4 py-3 text-[12px]">
        <dt className="text-fg-3">RSI 14</dt>
        <dd className="text-fg-2"><span className="num font-medium text-fg">{tech.state.rsi != null ? tech.state.rsi.toFixed(1) : "—"}</span> · {RSI_STATE_LABEL[tech.state.rsiState]}</dd>
        <dt className="text-fg-3">MACD</dt>
        <dd className="text-fg-2">{HIST_STATE_LABEL[tech.state.histState] ?? "—"}</dd>
        <dt className="text-fg-3">Divergence</dt>
        <dd className="text-fg-2">{lastDiv ? `${DIVERGENCE_LABEL[lastDiv.type]} (${lastDiv.indicator === "hist" ? "MACD hist." : lastDiv.indicator.toUpperCase()}), ${lastDiv.status}` : "None recent"}</dd>
      </dl>
      <p className="border-t border-line px-4 py-2.5 text-[11.5px] leading-snug text-fg-3">
        Confluence is an alignment index from −100 to +100, not a probability. Every level comes from the count shown; if price crosses the invalidation, the count is wrong.
        {tech.lastBarOpen && " The last bar is still forming."}
      </p>
    </aside>
  );
}
