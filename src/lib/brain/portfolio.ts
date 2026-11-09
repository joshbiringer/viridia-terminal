/**
 * Daily model portfolio from the reader's Brain: stocks and ETFs that the reader's theses favour and
 * (for stocks) whose fundamentals hold up, sized by signal strength under position and sector caps.
 * It is a research list for the reader to review by hand; nothing here places orders.
 */
import { thesisWeight, type BrainSignal, type MarketRow, type Thesis } from "./signal";
import { METRICS, type CompanyFigures } from "./screens";

export const RULES = {
  maxStocks: 20, maxEtfs: 10,
  maxStockWeight: 0.05, maxEtfWeight: 0.1, maxSectorWeight: 0.25,
  /** Share of the model in stocks when both sleeves have names; the rest goes to ETFs. */
  stockSleeve: 0.6,
  minDollarVolume: 5e6, minMarketCap: 2e9,
  perSectorCandidates: 6, favouredSectorMin: 0.3,
} as const;

/** Leveraged, inverse and volatility products are trading tools, not portfolio holdings. */
const TRADING_PRODUCT = /\b(2x|3x|ultra|ultrapro|bear|bull|inverse|daily|vix)\b|\bshort\b(?![- ]term)|volatility (futures|index)/i;

export type Sleeve = "stock" | "etf";
export interface Pick {
  symbol: string; name: string | null; sleeve: Sleeve; sector: string | null;
  label: BrainSignal["label"]; score: number; weight: number; close: number | null;
  /** Elliott invalidation level for the current count, when there is one. */
  invalidation: number | null;
  thesis: number | null; value: number | null; technical: number | null;
  why: string[]; conflict: boolean;
}
export interface Change { symbol: string; sleeve: Sleeve; kind: "new" | "add" | "trim" | "drop"; from: number; to: number }
export interface DailyList {
  date: string; generated_at: string; valueLive: boolean;
  stocks: Pick[]; etfs: Pick[]; cash: number;
  buyToday: Change[]; changes: Change[];
  avoid: { symbol: string; label: BrainSignal["label"]; score: number; why: string }[];
  universe: number;
}

type Sig = BrainSignal & { row: MarketRow };

const tc = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bAnd\b/g, "and");

/** Net weight of the reader's sector theses, by sector: positive means favoured. */
export function sectorTilt(theses: Thesis[], now = new Date()): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of theses) {
    for (const l of t.links) {
      if (l.kind !== "sector") continue;
      const st = l.stance ?? t.stance;
      const s = st === "bullish" ? 1 : st === "bearish" ? -1 : 0;
      const k = tc(l.value);
      out.set(k, (out.get(k) ?? 0) + s * thesisWeight(t, now) * l.weight);
    }
  }
  return out;
}

/** Quick value rank inside a sector: earnings yield, FCF yield and book-to-price, all must be positive to count. */
function quickValue(f: CompanyFigures): number | null {
  const ey = f.market_cap && f.net_income ? f.net_income / f.market_cap : null;
  if (ey == null || ey <= 0) return null;
  const fy = METRICS.fcf_yield.compute(f);
  const pb = METRICS.pb.compute(f);
  const de = METRICS.debt_equity.compute(f);
  let s = Math.min(ey, 0.15) / 0.15;
  if (fy != null) s += Math.max(-1, Math.min(fy, 0.12) / 0.12);
  if (pb != null) s += Math.min(1 / pb, 1);
  if (de != null && de > 2) s -= 0.5;
  return s;
}

/** Companies in the sectors the theses favour, cheapest first, for the signal engine to judge. */
export function sectorCandidates(theses: Thesis[], figs: CompanyFigures[], now = new Date()): string[] {
  const tilt = sectorTilt(theses, now);
  const out: string[] = [];
  for (const [sector, w] of tilt) {
    if (w < RULES.favouredSectorMin) continue;
    const ranked = figs
      .filter((f) => f.sector && tc(f.sector) === sector && (f.market_cap ?? 0) >= RULES.minMarketCap)
      .map((f) => ({ f, s: quickValue(f) }))
      .filter((x): x is { f: CompanyFigures; s: number } => x.s != null)
      .sort((a, b) => b.s - a.s)
      .slice(0, RULES.perSectorCandidates);
    out.push(...ranked.map((x) => x.f.symbol));
  }
  return out;
}

const isEtf = (s: Sig) => s.row.asset_subtype === "etf";

/** Is this signal a candidate for the model? */
export function eligible(s: Sig, valueLive: boolean): boolean {
  if (s.label !== "Buy" && s.label !== "Accumulate") return false;
  if (s.components < 2 || s.row.close == null) return false;
  if ((s.row.dollar_volume ?? 0) < RULES.minDollarVolume) return false;
  if (TRADING_PRODUCT.test(s.row.name ?? "")) return false;
  if (isEtf(s)) return (s.thesis?.score ?? 0) > 0;
  // Stocks: the theses must not be against it, and something must argue for it (a thesis or the fundamentals)
  if (s.thesis && s.thesis.score < 0) return false;
  if (valueLive && s.value && s.value.score < 0) return false;
  return (s.thesis?.score ?? 0) > 0 || (s.value?.score ?? 0) > 0.2;
}

/** Weights proportional to signal score, capped per position and per sector; whatever the caps leave is cash. */
export function size(picks: { symbol: string; score: number; sector: string | null }[], budget: number, cap: number, sectorCap: number): Map<string, number> {
  const w = new Map<string, number>();
  const total = picks.reduce((a, p) => a + Math.max(p.score, 0.01), 0);
  if (!total) return w;
  for (const p of picks) w.set(p.symbol, Math.min(cap, (budget * Math.max(p.score, 0.01)) / total));
  // Redistribute what the position cap freed, a few passes, to names still under the cap
  for (let i = 0; i < 4; i++) {
    const used = [...w.values()].reduce((a, b) => a + b, 0);
    const free = budget - used;
    const room = picks.filter((p) => (w.get(p.symbol) ?? 0) < cap - 1e-9);
    if (free < 1e-6 || !room.length) break;
    const rt = room.reduce((a, p) => a + Math.max(p.score, 0.01), 0);
    for (const p of room) w.set(p.symbol, Math.min(cap, (w.get(p.symbol) ?? 0) + (free * Math.max(p.score, 0.01)) / rt));
  }
  // Sector cap: scale a sector down to the cap; the excess becomes cash
  const bySector = new Map<string, string[]>();
  for (const p of picks) if (p.sector) bySector.set(p.sector, [...(bySector.get(p.sector) ?? []), p.symbol]);
  for (const syms of bySector.values()) {
    const tot = syms.reduce((a, s) => a + (w.get(s) ?? 0), 0);
    if (tot > sectorCap) for (const s of syms) w.set(s, ((w.get(s) ?? 0) * sectorCap) / tot);
  }
  return w;
}

const round = (x: number) => Math.round(x * 1000) / 1000;

function toPick(s: Sig, weight: number): Pick {
  const why = [...(s.thesis?.reasons.slice(0, 2) ?? []), ...(s.value?.reasons.slice(0, 2) ?? []), ...(s.technical?.reasons.slice(0, 1) ?? [])];
  return {
    symbol: s.symbol, name: s.row.name, sleeve: isEtf(s) ? "etf" : "stock", sector: s.row.sector,
    label: s.label, score: round(s.score), weight: round(weight), close: s.row.close,
    invalidation: s.row.glance_hold ?? null,
    thesis: s.thesis ? round(s.thesis.score) : null, value: s.value ? round(s.value.score) : null, technical: s.technical ? round(s.technical.score) : null,
    why, conflict: s.conflict,
  };
}

/** What changed since the last list: new names, adds and trims of a point or more, and names dropped. */
export function diff(prev: Pick[], next: Pick[]): Change[] {
  const before = new Map(prev.map((p) => [p.symbol, p]));
  const after = new Map(next.map((p) => [p.symbol, p]));
  const out: Change[] = [];
  for (const p of next) {
    const b = before.get(p.symbol);
    if (!b) out.push({ symbol: p.symbol, sleeve: p.sleeve, kind: "new", from: 0, to: p.weight });
    else if (p.weight - b.weight >= 0.01) out.push({ symbol: p.symbol, sleeve: p.sleeve, kind: "add", from: b.weight, to: p.weight });
    else if (b.weight - p.weight >= 0.01) out.push({ symbol: p.symbol, sleeve: p.sleeve, kind: "trim", from: b.weight, to: p.weight });
  }
  for (const b of prev) if (!after.has(b.symbol)) out.push({ symbol: b.symbol, sleeve: b.sleeve, kind: "drop", from: b.weight, to: 0 });
  return out;
}

export function buildDailyList(signals: Sig[], opts: { date: string; valueLive: boolean; previous?: DailyList | null; now?: Date }): DailyList {
  const pool = signals.filter((s) => eligible(s, opts.valueLive)).sort((a, b) => b.score - a.score);
  const stocks = pool.filter((s) => !isEtf(s)).slice(0, RULES.maxStocks);
  const etfs = pool.filter(isEtf).slice(0, RULES.maxEtfs);
  const sBudget = stocks.length && etfs.length ? RULES.stockSleeve : stocks.length ? 1 : 0;
  const eBudget = etfs.length ? 1 - sBudget : 0;
  const ws = size(stocks.map((s) => ({ symbol: s.symbol, score: s.score, sector: s.row.sector })), sBudget, RULES.maxStockWeight, RULES.maxSectorWeight);
  const we = size(etfs.map((s) => ({ symbol: s.symbol, score: s.score, sector: null })), eBudget, RULES.maxEtfWeight, 1);
  const sp = stocks.map((s) => toPick(s, ws.get(s.symbol) ?? 0)).filter((p) => p.weight >= 0.0025);
  const ep = etfs.map((s) => toPick(s, we.get(s.symbol) ?? 0)).filter((p) => p.weight >= 0.0025);
  const invested = [...sp, ...ep].reduce((a, p) => a + p.weight, 0);
  const prev = opts.previous ? [...opts.previous.stocks, ...opts.previous.etfs] : [];
  const changes = diff(prev, [...sp, ...ep]);
  const avoid = signals.filter((s) => s.label === "Sell" || s.label === "Reduce").sort((a, b) => a.score - b.score).slice(0, 12)
    .map((s) => ({ symbol: s.symbol, label: s.label, score: round(s.score), why: s.thesis?.reasons[0] ?? s.technical?.reasons[0] ?? "" }));
  return {
    date: opts.date, generated_at: (opts.now ?? new Date()).toISOString(), valueLive: opts.valueLive,
    stocks: sp, etfs: ep, cash: round(Math.max(0, 1 - invested)),
    buyToday: changes.filter((c) => c.kind === "new" || c.kind === "add"),
    changes, avoid, universe: signals.length,
  };
}

const pc = (x: number) => `${(x * 100).toFixed(1)}%`;
const px = (x: number | null) => (x == null ? "—" : `$${x >= 100 ? x.toFixed(0) : x.toFixed(2)}`);

/** Plain-text email body: what to review buying today, then the full model, then what to avoid. */
export function formatDailyEmail(d: DailyList, siteUrl: string): string {
  const L: string[] = [];
  L.push(`Viridia daily buy list — ${d.date}`);
  L.push(`Research list from your Brain for you to review. Nothing has been bought.`);
  if (!d.valueLive) L.push(`Note: SEC fundamentals are still loading, so stock picks rest on your theses and technicals only.`);
  L.push("");
  L.push(`TO REVIEW BUYING TODAY (${d.buyToday.length})`);
  if (!d.buyToday.length) L.push("  No new names or adds today. The model is unchanged.");
  const all = new Map([...d.stocks, ...d.etfs].map((p) => [p.symbol, p]));
  for (const c of d.buyToday) {
    const p = all.get(c.symbol)!;
    L.push(`  ${c.kind === "new" ? "NEW" : "ADD"} ${p.symbol} (${p.sleeve === "etf" ? "ETF" : "stock"}) — target ${pc(c.to)}${c.kind === "add" ? ` from ${pc(c.from)}` : ""}, ${p.label}, last ${px(p.close)}${p.invalidation ? `, Elliott invalidation ${px(p.invalidation)}` : ""}`);
    if (p.why[0]) L.push(`      ${p.why.slice(0, 2).join("; ")}`);
  }
  const exits = d.changes.filter((c) => c.kind === "drop" || c.kind === "trim");
  if (exits.length) {
    L.push("");
    L.push(`TO REVIEW TRIMMING OR SELLING (${exits.length})`);
    for (const c of exits) L.push(`  ${c.kind === "drop" ? "DROP" : "TRIM"} ${c.symbol} — ${pc(c.from)} → ${pc(c.to)}`);
  }
  const table = (title: string, rows: Pick[]) => {
    L.push("");
    L.push(`${title} (${rows.length})`);
    for (const p of rows) L.push(`  ${p.symbol.padEnd(6)} ${pc(p.weight).padStart(6)}  ${p.label.padEnd(10)} score ${p.score >= 0 ? "+" : ""}${p.score.toFixed(2)}  ${p.sector ?? ""}${p.conflict ? "  (your theses disagree)" : ""}`);
  };
  table("MODEL PORTFOLIO — STOCKS", d.stocks);
  table("MODEL PORTFOLIO — ETFs", d.etfs);
  L.push(`  Cash  ${pc(d.cash)}`);
  if (d.avoid.length) {
    L.push("");
    L.push("AVOID (Reduce / Sell signals)");
    for (const a of d.avoid) L.push(`  ${a.symbol.padEnd(6)} ${a.label.padEnd(7)} ${a.why}`);
  }
  L.push("");
  L.push(`Rules: equal thirds of your theses, value and technicals; stocks need your theses not against them and support from a thesis or fundamentals; max 5% per stock, 10% per ETF, 25% per sector; leveraged and inverse products excluded. ${d.universe} securities scored.`);
  L.push(`Full list with reasons: ${siteUrl}/brain/portfolio`);
  L.push(`Research output, not investment advice.`);
  return L.join("\n");
}
