/**
 * Ask Viridia About This Portfolio: deterministic answers assembled only from the computed workspace
 * (and a snapshot diff when one exists). No model writes these; nothing here can create a number,
 * a wave count, a correlation or a tax value that isn't already in the workspace.
 */
import type { Change } from "./snapshot";
import { FACTORS, listTxt, patternName, type Workspace } from "./workspace";

export const PORTFOLIO_QUESTIONS = [
  "What is driving portfolio risk?",
  "Where am I most concentrated?",
  "Which holdings behave similarly?",
  "Explain my factor exposure.",
  "Which positions are near structural invalidation?",
  "What changed since my last X-Ray?",
  "Compare this portfolio with SPY.",
] as const;

export interface Answer { question: string; lines: string[]; tab?: string }

const w = (v: number) => `${(v * 100).toFixed(1)}%`;
const sp = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(d)}%`;
const f2 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(2));

type Topic = "risk" | "concentration" | "similar" | "factors" | "invalidation" | "changed" | "benchmark" | "holding" | "unknown";

export function topicOf(q: string, symbols: string[]): { topic: Topic; symbol?: string } {
  const t = q.toLowerCase();
  const sym = symbols.find((s) => new RegExp(`\\b${s.toLowerCase().replace(/[.\-/]/g, "\\$&")}\\b`).test(t));
  if (/invalidat|break|structural risk|near (a )?level/.test(t)) return { topic: "invalidation" };
  if (/chang|since|last (x-?ray|review|snapshot)|differen/.test(t)) return { topic: "changed" };
  if (/compar|benchmark|spy|s&p|qqq|60\/40|versus|vs\.?/.test(t)) return { topic: "benchmark" };
  if (/factor|size|value|growth|momentum|quality|volatility tilt|style/.test(t)) return { topic: "factors" };
  if (/similar|together|correlat|cluster|overlap|diversif/.test(t)) return { topic: "similar" };
  if (/concentrat|largest|biggest|exposure|sector|weight/.test(t)) return { topic: "concentration" };
  if (/risk|volatil|drive|beta|drawdown/.test(t)) return { topic: "risk" };
  if (sym) return { topic: "holding", symbol: sym };
  return { topic: "unknown" };
}

export function answer(q: string, ws: Workspace, changes: Change[] | null, since: string | null): Answer {
  const { topic, symbol } = topicOf(q, ws.positions.map((p) => p.symbol));
  const lines: string[] = [];
  switch (topic) {
    case "risk": {
      const top = ws.risk.rows.slice(0, 5).filter((r) => r.contribution != null);
      if (!top.length) return { question: q, lines: ["Risk contribution needs at least 60 shared sessions of history for the holdings."], tab: "risk" };
      lines.push(`Modeled volatility is ${ws.metrics.vol != null ? w(ws.metrics.vol) : "—"} a year, with beta ${f2(ws.metrics.beta)} to the S&P 500.`);
      lines.push(`Largest contributors to that volatility: ${top.map((r) => `${r.symbol} ${w(r.contribution!)} of risk on ${w(r.weight)} of value`).join("; ")}.`);
      if (ws.risk.topShare) lines.push(`${ws.risk.topShare.n} holding${ws.risk.topShare.n === 1 ? "" : "s"} account for ${w(ws.risk.topShare.share)} of modeled volatility.`);
      if (ws.risk.flagged.length) lines.push(`Contributing materially more risk than weight (3+ points and 1.25× or more): ${ws.risk.flagged.join(", ")}.`);
      if (ws.risk.enb != null) lines.push(`The portfolio behaves like about ${ws.risk.enb.toFixed(1)} independent exposures.`);
      return { question: q, lines, tab: "risk" };
    }
    case "concentration": {
      const c = ws.concentration;
      lines.push(`Five largest positions: ${w(c.top5)} of value${c.largest ? `; the largest is ${c.largest.symbol} at ${w(c.largest.weight)}` : ""}.`);
      lines.push(`Effective number of holdings by weight: ${c.effective.toFixed(1)} (1 ÷ sum of squared weights).`);
      const secs = ws.sectors.filter((s) => s.sector !== "Unclassified").slice(0, 3);
      if (secs.length) lines.push(`Largest estimated sector exposures: ${secs.map((s) => `${s.sector} ${w(s.weight)}`).join(", ")}.`);
      const cl = ws.correlation.clusters[0];
      if (cl) lines.push(`${cl.name}: ${listTxt(cl.symbols)} together are ${w(cl.weight)} of value.`);
      return { question: q, lines, tab: "exposure" };
    }
    case "similar": {
      const cl = ws.correlation.clusters;
      if (!cl.length) lines.push(`No group of holdings has an average correlation of 0.60 or more.`);
      for (const c of cl.slice(0, 4)) lines.push(`${c.name}: ${listTxt(c.symbols)} (average correlation ${c.avgCorr.toFixed(2)}, ${w(c.weight)} of value).`);
      const pairs: { a: string; b: string; c: number }[] = [];
      ws.correlation.symbols.forEach((a, i) => ws.correlation.symbols.forEach((b, j) => { const c = ws.correlation.matrix[i][j]; if (j > i && c != null) pairs.push({ a, b, c }); }));
      pairs.sort((x, y) => y.c - x.c);
      if (pairs.length) lines.push(`Most correlated pairs: ${pairs.slice(0, 3).map((p) => `${p.a}/${p.b} ${p.c.toFixed(2)}`).join(", ")}.`);
      return { question: q, lines, tab: "correlation" };
    }
    case "factors": {
      const rows = ws.factors.rows.filter((r) => r.loading != null);
      if (!rows.length) return { question: q, lines: ["Factor loadings need at least 120 shared sessions of history."], tab: "exposure" };
      for (const r of rows) lines.push(`${r.label}: ${f2(r.loading)}${Math.abs(r.t ?? 0) >= 2 ? "" : " (not statistically distinct from zero)"}. ${FACTORS.find((f) => f.key === r.key)?.means ?? ""}.`);
      if (ws.factors.r2 != null) lines.push(`Together these explain ${w(ws.factors.r2)} of the portfolio's daily return variation over the past year.`);
      lines.push("Loadings describe how the portfolio has moved with each factor; they are not a forecast or a recommendation.");
      return { question: q, lines, tab: "exposure" };
    }
    case "invalidation": {
      const rows = ws.structure.rows.filter((r) => r.invalidationDist != null).sort((a, b) => Math.abs(a.invalidationDist!) - Math.abs(b.invalidationDist!));
      const near = ws.structure.nearInvalidation;
      lines.push(near.symbols.length
        ? `${w(near.weight)} of value is within 3% of a Viridia structural invalidation level: ${listTxt(near.symbols)}.`
        : "No holding is within 3% of its preferred count's invalidation level.");
      if (rows.length) lines.push(`Closest levels: ${rows.slice(0, 5).map((r) => `${r.symbol} ${sp(r.invalidationDist!)} (${patternName(r.pattern) ?? "count"}, level ${r.invalidation!.toLocaleString("en-US", { maximumFractionDigits: 2 })})`).join("; ")}.`);
      return { question: q, lines, tab: "structure" };
    }
    case "changed": {
      if (!changes) return { question: q, lines: ["There's no earlier snapshot to compare with. Save the portfolio and a snapshot, and the next X-Ray will list what changed."], tab: "overview" };
      if (!changes.length) return { question: q, lines: [`Nothing material has changed since the snapshot of ${since}.`], tab: "overview" };
      return { question: q, lines: [`Since the snapshot of ${since}:`, ...changes.map((c) => c.text)], tab: "overview" };
    }
    case "benchmark": {
      const want = /qqq|nasdaq/i.test(q) ? "qqq" : /60\/40|balanced/i.test(q) ? "6040" : "spy";
      const p = ws.benchmarks.find((b) => b.id === "portfolio"), b = ws.benchmarks.find((x) => x.id === want);
      if (!p || !b) return { question: q, lines: ["The comparison needs at least 60 shared sessions of history."], tab: "overview" };
      lines.push(`Past year: portfolio ${p.r1y != null ? sp(p.r1y) : "—"} vs ${b.label} ${b.r1y != null ? sp(b.r1y) : "—"}.`);
      lines.push(`Volatility ${p.vol != null ? w(p.vol) : "—"} vs ${b.vol != null ? w(b.vol) : "—"}; largest drawdown ${p.mdd != null ? sp(p.mdd) : "—"} vs ${b.mdd != null ? sp(b.mdd) : "—"}.`);
      lines.push(`Beta ${f2(p.beta)} vs ${f2(b.beta)}; Sharpe ratio ${f2(p.sharpe)} vs ${f2(b.sharpe)}; correlation between them ${f2(b.corr)}.`);
      if (p.uptrend != null && b.uptrend != null) lines.push(`Weight in Viridia uptrends: ${w(p.uptrend)} vs ${w(b.uptrend)}.`);
      lines.push("Past figures use today's weights applied to past returns; they are not the account's record.");
      return { question: q, lines, tab: "overview" };
    }
    case "holding": {
      const p = ws.positions.find((x) => x.symbol === symbol)!;
      const r = ws.risk.rows.find((x) => x.symbol === symbol);
      const s = ws.structure.rows.find((x) => x.symbol === symbol);
      lines.push(`${p.symbol}: ${w(p.weight)} of value ($${p.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}), estimated sector ${p.sector}.`);
      if (r?.contribution != null) lines.push(`${w(r.contribution)} of modeled risk; volatility ${r.vol != null ? w(r.vol) : "—"}, beta ${f2(r.beta)}, correlation to the portfolio ${f2(r.corrPortfolio)}.`);
      if (s) lines.push(`Viridia structure: trend ${s.trend ?? "not measured"}; preferred count ${s.pattern ? `${patternName(s.pattern)}${s.complete ? " complete" : ` wave ${s.wave}`}` : "none"}${s.score != null ? `, Pattern Confidence ${s.score}` : ""}${s.invalidationDist != null ? `; invalidation ${sp(s.invalidationDist)} away` : ""}.`);
      if (p.gain != null && p.asset !== "cash") lines.push(`Unrealized ${p.gain >= 0 ? "gain" : "loss"} $${Math.abs(p.gain).toLocaleString("en-US", { maximumFractionDigits: 0 })}.`);
      return { question: q, lines, tab: "holdings" };
    }
    default:
      return { question: q, lines: ["Viridia answers from this X-Ray's own figures. Try one of the suggested questions, or ask about a holding by its ticker."] };
  }
}
