/**
 * Meeting prep for a saved portfolio (Cycle 5, phase 5). Everything comes from the X-Ray of the
 * saved holdings and the snapshot stored at the last review; no client data is invented. Two
 * versions of the talking points: one for the advisor (with wave-structure terms) and one to share
 * with the client (plain language, no Elliott terms, a not-a-recommendation note).
 */
import { DRIFT_BAND, type Position, type XRay } from "./xray";

export interface ReviewSnapshot {
  v: 1; at: string; asOf: string | null; total: number;
  positions: { symbol: string; weight: number; value: number; close: number; dir: string | null; setup: string | null }[];
  beta: number | null; vol: number | null; top5: number;
}

export function snapshotOf(x: XRay, at = new Date()): ReviewSnapshot {
  return {
    v: 1, at: at.toISOString(), asOf: x.asOf, total: x.total,
    positions: x.positions.map((p) => ({ symbol: p.symbol, weight: p.weight, value: p.value, close: p.close, dir: p.ctx.glance_wave_dir, setup: p.ctx.setup_side })),
    beta: x.risk.beta, vol: x.risk.vol, top5: x.concentration.top5,
  };
}

export interface ReviewDiff {
  since: string;
  valueChange: number; valueChangePct: number | null;
  added: string[]; removed: string[];
  weightMoves: { symbol: string; from: number; to: number }[];
  priceMoves: { symbol: string; change: number }[];
  structureFlips: { symbol: string; from: string | null; to: string | null }[];
  betaFrom: number | null; betaTo: number | null;
}

export function compareReview(x: XRay, prev: ReviewSnapshot | null | undefined): ReviewDiff | null {
  if (!prev || prev.v !== 1) return null;
  const was = new Map(prev.positions.map((p) => [p.symbol, p]));
  const now = new Map(x.positions.map((p) => [p.symbol, p]));
  return {
    since: prev.at,
    valueChange: x.total - prev.total,
    valueChangePct: prev.total > 0 ? x.total / prev.total - 1 : null,
    added: x.positions.filter((p) => !was.has(p.symbol)).map((p) => p.symbol),
    removed: prev.positions.filter((p) => !now.has(p.symbol)).map((p) => p.symbol),
    weightMoves: x.positions.filter((p) => was.has(p.symbol)).map((p) => ({ symbol: p.symbol, from: was.get(p.symbol)!.weight, to: p.weight }))
      .filter((m) => Math.abs(m.to - m.from) >= 0.02).sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from)),
    priceMoves: x.positions.filter((p) => was.get(p.symbol)?.close).map((p) => ({ symbol: p.symbol, change: p.close / was.get(p.symbol)!.close - 1 }))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5),
    structureFlips: x.positions.filter((p) => was.has(p.symbol) && (was.get(p.symbol)!.dir ?? null) !== (p.ctx.glance_wave_dir ?? null))
      .map((p) => ({ symbol: p.symbol, from: was.get(p.symbol)!.dir, to: p.ctx.glance_wave_dir })),
    betaFrom: prev.beta, betaTo: x.risk.beta,
  };
}

/** Holdings bought 300–365 days ago with a gain: waiting a little longer would make the gain long-term. */
export function nearLongTerm(x: XRay, holdings: { symbol: string; acquired: string | null }[], today = new Date()): Position[] {
  return x.positions.filter((p) => {
    const h = holdings.find((q) => q.symbol === p.symbol);
    if (!h?.acquired || !(p.gain && p.gain > 0)) return false;
    const days = (today.getTime() - Date.parse(h.acquired)) / 864e5;
    return days >= 300 && days <= 365;
  });
}

export type Audience = "advisor" | "client";
export interface Point { text: string; tone?: "pos" | "neg" | "warn" }

const pct = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(d)}%`;
const w = (v: number) => `${(v * 100).toFixed(1)}%`;
const usd = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export function talkingPoints(x: XRay, diff: ReviewDiff | null, audience: Audience, extra: { nearLt?: Position[] } = {}): Point[] {
  const out: Point[] = [];
  const c = x.concentration;
  const client = audience === "client";

  // since last review
  if (diff) {
    out.push({ text: client
      ? `Since we last met on ${day(diff.since)}, the portfolio's value has moved ${pct(diff.valueChangePct ?? 0)} (${usd(diff.valueChange)}).`
      : `Since the ${day(diff.since)} review: value ${pct(diff.valueChangePct ?? 0)} (${usd(diff.valueChange)}).`, tone: diff.valueChange >= 0 ? "pos" : "neg" });
    if (diff.added.length || diff.removed.length) out.push({ text: `${diff.added.length ? `New holdings: ${diff.added.join(", ")}. ` : ""}${diff.removed.length ? `No longer held: ${diff.removed.join(", ")}.` : ""}`.trim() });
    const big = diff.priceMoves.filter((m) => Math.abs(m.change) >= 0.1);
    if (big.length) out.push({ text: `${client ? "Largest price changes since then" : "Biggest movers since review"}: ${big.map((m) => `${m.symbol} ${pct(m.change)}`).join(", ")}.` });
    if (!client && diff.structureFlips.length) out.push({ text: `Preferred count changed direction for ${diff.structureFlips.map((f) => `${f.symbol} (${f.from ?? "none"} → ${f.to ?? "none"})`).join(", ")}.`, tone: "warn" });
  } else {
    out.push({ text: client ? "This is our first saved review, so today's figures become the starting point for next time." : "No earlier review saved: marking this review stores today's figures as the baseline." });
  }

  // concentration and drift
  if (c.over20.length) out.push({ text: client
    ? `${c.over20.map((p) => p.symbol).join(" and ")} ${c.over20.length === 1 ? "makes" : "make"} up more than a fifth of the portfolio each, so ${c.over20.length === 1 ? "its" : "their"} ups and downs have an outsized effect.`
    : `Concentration: ${c.over20.map((p) => `${p.symbol} ${w(p.weight)}`).join(", ")} over 20%; effective holdings ${c.effective.toFixed(1)}.`, tone: "warn" });
  else if (c.over10.length) out.push({ text: client
    ? `The largest positions are ${c.over10.map((p) => `${p.symbol} (${w(p.weight)})`).join(", ")}.`
    : `Over 10%: ${c.over10.map((p) => `${p.symbol} ${w(p.weight)}`).join(", ")}; top five ${w(c.top5)}.` });
  const drifted = x.drift?.filter((d) => d.flag) ?? [];
  if (drifted.length) out.push({ text: client
    ? `Some holdings have moved away from their intended weights: ${drifted.map((d) => `${d.symbol} is ${w(d.weight)} against a ${w(d.target)} target`).join("; ")}. We can discuss whether to rebalance.`
    : `Drift ${Math.round(DRIFT_BAND * 100)}+ pts: ${drifted.map((d) => `${d.symbol} ${w(d.weight)} vs ${w(d.target)}`).join(", ")}. Weigh tax cost before rebalancing.`, tone: "warn" });
  else if (x.drift) out.push({ text: client ? "Every holding is close to its intended weight." : `All holdings within ${Math.round(DRIFT_BAND * 100)} pts of target.`, tone: "pos" });

  // risk
  if (x.risk.beta != null) out.push({ text: client
    ? `The portfolio has tended to move about ${x.risk.beta.toFixed(1)} times as much as the S&P 500 over the past year${x.risk.drawdown != null ? `, with a largest drop of ${pct(x.risk.drawdown)} from a high` : ""}.`
    : `Beta ${x.risk.beta.toFixed(2)}${diff?.betaFrom != null ? ` (was ${diff.betaFrom.toFixed(2)})` : ""}, volatility ${x.risk.vol != null ? w(x.risk.vol) : "—"}, max drawdown ${x.risk.drawdown != null ? pct(x.risk.drawdown) : "—"}.` });
  if (x.pairs[0] && x.pairs[0].corr >= 0.85) out.push({ text: client
    ? `${x.pairs[0].a} and ${x.pairs[0].b} have moved almost in lockstep, so together they add less diversification than it looks.`
    : `${x.pairs[0].a} / ${x.pairs[0].b} correlation ${x.pairs[0].corr.toFixed(2)}: overlapping exposure.` });

  // structure (advisor only: Elliott terms stay out of the client version)
  if (!client) {
    out.push({ text: `Structure: preferred counts point up for ${w(x.structure.up)} of value and down for ${w(x.structure.down)}.` });
    if (x.structure.nearLevel.length) out.push({ text: `Within 3% of invalidation: ${x.structure.nearLevel.map((p) => p.symbol).join(", ")}.`, tone: "warn" });
  } else if (x.structure.nearLevel.length) {
    out.push({ text: `${x.structure.nearLevel.map((p) => p.symbol).join(", ")} ${x.structure.nearLevel.length === 1 ? "is" : "are"} trading near a price level where our read of the recent trend would change; worth watching.` });
  }

  // tax
  if (x.tax) {
    if (x.tax.losses.length) out.push({ text: client
      ? `${x.tax.losses.map((p) => p.symbol).join(", ")} ${x.tax.losses.length === 1 ? "is" : "are"} below what was paid. Selling at a loss can offset gains for tax purposes; the wash-sale rule limits buying the same holding back within 30 days.`
      : `Loss candidates: ${x.tax.losses.map((p) => `${p.symbol} ${usd(p.gain ?? 0)}`).join(", ")} (wash-sale rule applies).` });
    if (extra.nearLt?.length) out.push({ text: client
      ? `${extra.nearLt.map((p) => p.symbol).join(", ")} will reach a one-year holding period soon; waiting could make any gain long-term for tax purposes.`
      : `Near long-term: ${extra.nearLt.map((p) => p.symbol).join(", ")} held 300–365 days with a gain.` });
  }
  if (client) out.push({ text: "This summary is for discussion. It describes the portfolio as it stands and is not a recommendation to buy or sell anything." });
  return out;
}
