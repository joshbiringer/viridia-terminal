/**
 * Technical research commentary, written only from the engine's structured output. Every count,
 * value, level and divergence quoted here comes from TechnicalPayload; nothing is estimated. The
 * optional language model (lib/ask/llm.ts) may rephrase these sections but is checked against them.
 */
import type { TechnicalPayload } from "./technical";
import type { Degree } from "@engine/pivots";
import { CLASS_LABEL } from "@engine/confluence";
import { DIVERGENCE_LABEL, HIST_STATE_LABEL, RSI_STATE_LABEL } from "@engine/momentum";

const px = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(2) : Math.abs(x) >= 1 ? x.toFixed(2) : x.toPrecision(3));
const d10 = (ts: string) => ts.slice(0, 10);
const an = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");
/** Lower-case the first letter only, so acronyms (RSI, MACD) survive mid-sentence. */
const lcFirst = (t: string) => (/^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);
const PATTERN: Record<string, string> = { impulse: "impulse", leading_diagonal: "leading diagonal", ending_diagonal: "ending diagonal", zigzag: "zigzag", flat: "flat", triangle: "triangle" };

export interface CommentarySection { key: string; title: string; text: string }

export function technicalCommentary(t: TechnicalPayload, degree: Degree, symbol: string): CommentarySection[] {
  const c = t.confluence[degree];
  const w = t.waves[degree];
  const st = t.state;
  const close = c.close;
  const out: CommentarySection[] = [];

  // Current structure
  const p = w.preferred;
  out.push({
    key: "structure", title: "Current structure",
    text: !p ? `There is no rule-valid Elliott Wave count for ${symbol} at ${degree} degree on this timeframe, so no wave interpretation is offered.`
      : `The preferred ${degree}-degree count is ${p.complete ? "a completed" : an(PATTERN[p.pattern])} ${PATTERN[p.pattern]} ${p.direction === "up" ? "advance" : "decline"}${p.complete ? "" : `, with wave ${p.next.label} in progress ${p.next.direction}`} (Pattern Confidence ${p.score ?? "n/a"}).`
        + (w.alternate ? ` The alternate count is ${w.alternate.complete ? "a completed " : `${an(PATTERN[w.alternate.pattern])} `}${PATTERN[w.alternate.pattern]} ${w.alternate.direction === "up" ? "advance" : "decline"} (Pattern Confidence ${w.alternate.score ?? "n/a"}), ${w.alternate.next.direction === p.next.direction ? "pointing the same way" : "pointing the other way"}.` : " No alternate count tells a different story.")
        + " Counts are interpretations of confirmed swings, not certainties.",
  });

  // Momentum assessment
  const recentDiv = [...t.divergences].filter((d) => d.indicator !== "hist").sort((a, b) => b.confirmedIndex - a.confirmedIndex)[0];
  out.push({
    key: "momentum", title: "Momentum assessment",
    text: st.rsi == null ? "There isn't enough history to calculate RSI and MACD on this timeframe."
      : `RSI(14) is ${st.rsi.toFixed(1)}: ${RSI_STATE_LABEL[st.rsiState].toLowerCase()}. MACD is ${st.macdAboveZero ? "above" : "below"} zero and ${st.macdAboveSignal ? "above" : "below"} its signal line; the histogram is ${HIST_STATE_LABEL[st.histState].toLowerCase()}.`
        + (st.lastMacdCross ? ` The last signal-line crossover was ${st.lastMacdCross.direction} on ${d10(st.lastMacdCross.ts)}.` : "")
        + (recentDiv ? ` Most recent divergence: ${DIVERGENCE_LABEL[recentDiv.type].toLowerCase()} on ${recentDiv.indicator === "rsi" ? "RSI" : "MACD"} (${d10(recentDiv.first.ts)} → ${d10(recentDiv.second.ts)}, ${recentDiv.status === "developing" ? "still developing" : `confirmed ${d10(recentDiv.confirmedTs)}`}). A divergence is an early warning until price confirms it.` : " No divergence has been detected recently."),
  });

  // Fibonacci position
  const fib = c.components.find((x) => x.key === "fib")!;
  out.push({
    key: "fib", title: "Fibonacci position",
    text: fib.evidence.length ? fib.evidence.map((e) => e.text).join(" ") : "No Fibonacci relationships are close enough to price to matter right now.",
  });

  // Bullish and bearish scenarios
  const scen = (dir: "bullish" | "bearish") => {
    const s = c.scenarios.filter((x) => x.direction === dir);
    const lv = c.keyLevels;
    const above = close != null ? lv.filter((l) => l.price > close).sort((a, b) => a.price - b.price)[0] : null;
    const below = close != null ? lv.filter((l) => l.price < close).sort((a, b) => b.price - a.price)[0] : null;
    const base = s.length ? s.map((x) => `${x.title} (${x.status}): ${x.interpretation}`).join(" ")
      : dir === "bullish"
        ? `No bullish wave scenario is active at this degree. ${above ? `A close above ${px(above.price)} (${above.label.toLowerCase()}) would strengthen the bullish case.` : ""}`
        : `No bearish wave scenario is active at this degree. ${below ? `A close below ${px(below.price)} (${below.label.toLowerCase()}) would strengthen the bearish case.` : ""}`;
    return base.trim();
  };
  out.push({ key: "bull", title: "Bullish scenario", text: scen("bullish") });
  out.push({ key: "bear", title: "Bearish scenario", text: scen("bearish") });

  // Key levels
  out.push({
    key: "levels", title: "Key levels",
    text: c.keyLevels.length ? c.keyLevels.slice(0, 8).map((l) => `${px(l.price)}: ${l.label}`).join("; ") + "." : "No key levels are defined at this degree.",
  });

  // Overall
  const sup = c.supporting.slice(0, 2).map((e) => lcFirst(e.text.replace(/\.$/, "")));
  const con = c.conflicting.slice(0, 2).map((e) => lcFirst(e.text.replace(/\.$/, "")));
  out.push({
    key: "overall", title: "Overall technical assessment",
    text: `${CLASS_LABEL[c.classification]} (alignment index ${c.index > 0 ? "+" : ""}${c.index} on a −100 to +100 scale).`
      + (sup.length ? ` Main support: ${sup.join("; ")}.` : "")
      + (con.length ? ` Main conflict: ${con.join("; ")}.` : " There is little conflicting evidence.")
      + " The index measures how well the layers line up; it is not a probability, an expected return or a recommendation, and its weights have not yet been validated out of sample.",
  });
  return out;
}
