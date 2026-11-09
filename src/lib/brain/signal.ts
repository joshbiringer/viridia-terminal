/**
 * Brain signals: the reader's theses, value and technicals combined into one research signal per
 * security, in equal thirds (the reader's choice). Each component is a score from −1 (bearish) to +1
 * (bullish) with the reasons behind it; a missing component is left out, never guessed, and a signal
 * built on fewer than two components can't reach Buy or Sell. Research output, not advice.
 */

export type Stance = "bullish" | "bearish" | "neutral";
export type Horizon = "weeks" | "months" | "year" | "multi-year";
export type ThesisStatus = "active" | "watching" | "retired" | "invalidated";

export interface Thesis {
  id: string; title: string; stance: Stance; conviction: number; horizon: Horizon; status: ThesisStatus;
  style: "value" | "macro" | "technical" | "thematic" | "sentiment";
  thesis: string; invalidation: string | null; tags: string[]; created_at: string; expires_on: string | null;
  source: { title: string; publisher: string | null; published_on: string | null; kind: string } | null;
  links: { kind: "symbol" | "sector"; value: string; stance: Stance | null; weight: number }[];
}

export interface MarketRow {
  symbol: string; name: string | null; asset_subtype: string | null; sector: string | null;
  close: number | null; last_ts: string | null; trend: "uptrend" | "mixed" | "downtrend" | "insufficient" | null;
  vs_sma50: number | null; vs_sma200: number | null; from_high: number | null; dollar_volume: number | null;
  glance_pattern: string | null; glance_complete: boolean | null; glance_wave: string | null;
  glance_wave_dir: "up" | "down" | null; glance_score: number | null; glance_hold: number | null;
}

/** Value inputs, all optional: whatever the fundamentals pipeline has for the company. */
export interface ValueInputs {
  pe?: number | null; sectorPe?: number | null;
  ps?: number | null; sectorPs?: number | null;
  pb?: number | null; fcfYield?: number | null; netCashToCap?: number | null;
  opMargin?: number | null; sectorOpMargin?: number | null; growth?: number | null;
  /** The reader's own screens, evaluated for this company. */
  screens?: { name: string; philosophy: string; passed: boolean; met: number; total: number }[];
}

export interface Component { score: number; reasons: string[] }
export type SignalLabel = "Buy" | "Accumulate" | "Hold" | "Reduce" | "Sell";
export interface BrainSignal {
  symbol: string; label: SignalLabel; score: number; components: number;
  thesis: Component | null; value: Component | null; technical: Component | null;
  theses: { id: string; title: string; stance: Stance; contribution: number }[];
  conflict: boolean;
}

/** Sector to its SPDR sector ETF, so a sector thesis reaches the ETF even before company sectors are loaded. */
export const SECTOR_ETF: Record<string, string> = {
  "Energy": "XLE", "Information Technology": "XLK", "Technology": "XLK", "Financials": "XLF", "Health Care": "XLV",
  "Consumer Staples": "XLP", "Consumer Discretionary": "XLY", "Industrials": "XLI", "Materials": "XLB",
  "Utilities": "XLU", "Real Estate": "XLRE", "Communication Services": "XLC",
};

const clip = (x: number, a = -1, b = 1) => Math.max(a, Math.min(b, x));
const sign = (s: Stance) => (s === "bullish" ? 1 : s === "bearish" ? -1 : 0);
const HORIZON_DAYS: Record<Horizon, number> = { weeks: 42, months: 180, year: 400, "multi-year": 1100 };
const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(0)}%`;

/** A thesis fades as it ages past its horizon; expired, retired or invalidated theses count for nothing. */
export function thesisWeight(t: Pick<Thesis, "status" | "conviction" | "horizon" | "created_at" | "expires_on">, now = new Date()): number {
  if (t.status === "retired" || t.status === "invalidated") return 0;
  if (t.expires_on && Date.parse(t.expires_on + "T23:59:59Z") < now.getTime()) return 0;
  const age = (now.getTime() - Date.parse(t.created_at)) / 86_400_000;
  const h = HORIZON_DAYS[t.horizon];
  const decay = age <= h ? 1 : Math.max(0, 1 - (age - h) / h);
  return (t.conviction / 5) * decay * (t.status === "watching" ? 0.5 : 1);
}

/** Does a thesis bear on this security, and with which stance and weight? */
function linkFor(t: Thesis, m: Pick<MarketRow, "symbol" | "sector">) {
  const sym = m.symbol.toUpperCase();
  const direct = t.links.find((l) => l.kind === "symbol" && l.value === sym);
  if (direct) return direct;
  const sector = t.links.find((l) => l.kind === "sector" && ((m.sector && l.value.toUpperCase() === m.sector.toUpperCase()) || SECTOR_ETF[titleCase(l.value)] === sym));
  return sector ? { ...sector, weight: sector.weight * (m.sector ? 0.6 : 1) } : null;
}
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bAnd\b/g, "and");

export function thesisComponent(m: Pick<MarketRow, "symbol" | "sector">, theses: Thesis[], now = new Date()) {
  const hits: BrainSignal["theses"] = [];
  let sum = 0;
  for (const t of theses) {
    const l = linkFor(t, m);
    if (!l) continue;
    const st = l.stance ?? t.stance;
    const c = sign(st) * thesisWeight(t, now) * l.weight;
    if (c === 0 && st !== "neutral") continue;
    hits.push({ id: t.id, title: t.title, stance: st, contribution: c });
    sum += c;
  }
  if (!hits.length) return { component: null, hits, conflict: false };
  const conflict = hits.some((h) => h.contribution > 0.05) && hits.some((h) => h.contribution < -0.05);
  const score = clip(Math.tanh(sum * 1.1));
  const reasons = hits.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 3)
    .map((h) => `${h.stance === "bullish" ? "Bullish" : h.stance === "bearish" ? "Bearish" : "Neutral"}: ${h.title}`);
  if (conflict) reasons.push("Your theses disagree on this one.");
  return { component: { score, reasons }, hits, conflict };
}

/**
 * Value: cheaper than its sector on earnings and sales, free-cash-flow yield, book value and net cash,
 * tempered by quality (margins versus sector). ETFs and companies without filings get no value score.
 */
export function valueComponent(v: ValueInputs | null): Component | null {
  if (!v) return null;
  const parts: { s: number; w: number; why: string }[] = [];
  if (v.pe != null && v.pe > 0 && v.sectorPe) {
    const s = clip(Math.log(v.sectorPe / v.pe) / Math.log(2));
    parts.push({ s, w: 1, why: `P/E ${v.pe.toFixed(1)}× vs sector ${v.sectorPe.toFixed(1)}×` });
  } else if (v.pe == null && v.sectorPe && v.ps == null) { /* no earnings data */ }
  if (v.ps != null && v.ps > 0 && v.sectorPs) {
    const s = clip(Math.log(v.sectorPs / v.ps) / Math.log(2));
    parts.push({ s, w: 0.7, why: `P/S ${v.ps.toFixed(1)}× vs sector ${v.sectorPs.toFixed(1)}×` });
  }
  if (v.fcfYield != null) {
    const s = clip((v.fcfYield - 0.04) / 0.06);
    parts.push({ s, w: 1, why: `Free-cash-flow yield ${(v.fcfYield * 100).toFixed(1)}%` });
  }
  if (v.pb != null && v.pb > 0) {
    const s = clip((2.5 - v.pb) / 2.5);
    parts.push({ s, w: 0.5, why: `Price to book ${v.pb.toFixed(1)}×` });
  }
  if (v.netCashToCap != null) {
    const s = clip(v.netCashToCap * 4);
    parts.push({ s, w: 0.5, why: v.netCashToCap >= 0 ? `Net cash ${pct(v.netCashToCap)} of market cap` : `Net debt ${pct(-v.netCashToCap)} of market cap` });
  }
  if (v.opMargin != null && v.sectorOpMargin != null) {
    const s = clip((v.opMargin - v.sectorOpMargin) / 0.15);
    parts.push({ s, w: 0.6, why: `Operating margin ${(v.opMargin * 100).toFixed(0)}% vs sector ${(v.sectorOpMargin * 100).toFixed(0)}%` });
  }
  for (const sc of v.screens ?? []) {
    if (sc.total === 0) continue;
    const valueLike = sc.philosophy === "value" || sc.philosophy === "quality";
    if (sc.passed) parts.push({ s: valueLike ? 0.9 : 0.5, w: valueLike ? 1.2 : 0.6, why: `Passes your ${sc.name} screen` });
    else if (valueLike && sc.met >= sc.total - 1) parts.push({ s: 0.35, w: 0.6, why: `Meets ${sc.met} of ${sc.total} criteria in your ${sc.name} screen` });
  }
  if (!parts.length) return null;
  const w = parts.reduce((a, p) => a + p.w, 0);
  const score = clip(parts.reduce((a, p) => a + p.s * p.w, 0) / w);
  return { score, reasons: parts.sort((a, b) => Math.abs(b.s * b.w) - Math.abs(a.s * a.w)).slice(0, 3).map((p) => p.why) };
}

/** Technicals: trend, position against the 200-day average and the Elliott count's next expected wave. */
export function technicalComponent(m: MarketRow | null): Component | null {
  if (!m || m.close == null) return null;
  const parts: { s: number; w: number; why: string }[] = [];
  if (m.trend && m.trend !== "insufficient") {
    parts.push({ s: m.trend === "uptrend" ? 1 : m.trend === "downtrend" ? -1 : 0, w: 0.35, why: m.trend === "mixed" ? "Trend mixed" : `In a ${m.trend}` });
  }
  if (m.vs_sma200 != null) {
    parts.push({ s: clip(m.vs_sma200 / 0.1), w: 0.25, why: `${pct(m.vs_sma200)} vs 200-day average` });
  }
  if (m.glance_wave_dir && m.glance_score != null) {
    const conf = clip(m.glance_score / 100, 0, 1);
    const label = m.glance_complete ? `${m.glance_pattern?.replace(/_/g, " ") ?? "pattern"} complete` : `wave ${m.glance_wave ?? "?"} of ${m.glance_pattern?.replace(/_/g, " ") ?? "a pattern"}`;
    parts.push({ s: (m.glance_wave_dir === "up" ? 1 : -1) * conf, w: 0.4, why: `Elliott count: ${label}, next move ${m.glance_wave_dir} (confidence ${m.glance_score})` });
  }
  if (!parts.length) return null;
  const w = parts.reduce((a, p) => a + p.w, 0);
  return { score: clip(parts.reduce((a, p) => a + p.s * p.w, 0) / w), reasons: parts.map((p) => p.why) };
}

export function labelFor(score: number, components: number): SignalLabel {
  const strong = components >= 2;
  if (score >= 0.45 && strong) return "Buy";
  if (score >= 0.15) return "Accumulate";
  if (score <= -0.45 && strong) return "Sell";
  if (score <= -0.15) return "Reduce";
  return "Hold";
}

/** Equal thirds over whichever components exist. */
export function brainSignal(m: MarketRow, theses: Thesis[], value: ValueInputs | null, now = new Date()): BrainSignal {
  const th = thesisComponent(m, theses, now);
  const va = m.asset_subtype === "etf" ? null : valueComponent(value);
  const te = technicalComponent(m);
  const comps = [th.component, va, te].filter((c): c is Component => !!c);
  const score = comps.length ? comps.reduce((a, c) => a + c.score, 0) / comps.length : 0;
  return {
    symbol: m.symbol, label: labelFor(score, comps.length), score, components: comps.length,
    thesis: th.component, value: va, technical: te, theses: th.hits, conflict: th.conflict,
  };
}

/** Every security the theses touch: direct symbols, plus each linked sector's ETF. */
export function thesisUniverse(theses: Thesis[]): string[] {
  const out = new Set<string>();
  for (const t of theses) {
    if (t.status === "retired" || t.status === "invalidated") continue;
    for (const l of t.links) {
      if (l.kind === "symbol") out.add(l.value.toUpperCase());
      else { const etf = SECTOR_ETF[titleCase(l.value)]; if (etf) out.add(etf); }
    }
  }
  return [...out];
}

export const SIGNAL_TONE: Record<SignalLabel, string> = {
  Buy: "var(--pos)", Accumulate: "var(--pos)", Hold: "var(--text-2)", Reduce: "var(--neg)", Sell: "var(--neg)",
};
