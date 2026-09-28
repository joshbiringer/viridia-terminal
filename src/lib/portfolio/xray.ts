/**
 * Portfolio X-Ray: parse a holdings list and measure it with stored market data. Pure functions; the
 * API route supplies the data. Nothing about the holdings is stored.
 */
import { TRADING_DAYS, beta, correlation, dailyReturns, maxDrawdown, periodReturn, volatility, type Close } from "@/lib/analysis/stats";

export interface Holding { symbol: string; shares: number; avgCost: number | null; acquired: string | null }
export interface ParseResult { holdings: Holding[]; errors: string[] }

const MAX_HOLDINGS = 100;
const num = (s: string | undefined) => {
  if (s == null) return NaN;
  const t = s.replace(/[$,\s]/g, "");
  return t === "" ? NaN : Number(t);
};

/**
 * Accepts CSV or whitespace-separated lines: symbol, shares, then optionally average cost per share
 * and acquisition date. A header row is recognized by name ("symbol"/"ticker", "shares"/"quantity",
 * "avg cost"/"cost per share"/"price paid", "cost basis"/"total cost", "acquired"/"date"). Duplicate
 * symbols are combined, with cost weighted by shares.
 */
export function parseHoldings(text: string): ParseResult {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (!lines.length) return { holdings: [], errors: ["Paste at least one holding."] };
  const split = (l: string) => (l.includes(",") ? csvCells(l) : l.includes("\t") ? l.split("\t") : l.split(/\s+/)).map((c) => c.trim().replace(/^"|"$/g, ""));
  let cols = { symbol: 0, shares: 1, avg: 2, total: -1, date: 3 };
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const find = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.includes(n)));
  if (head.some((h) => /symbol|ticker|shares|quantity/.test(h))) {
    cols = {
      symbol: find("symbol", "ticker"), shares: find("shares", "quantity", "qty"),
      avg: find("avg cost", "average cost", "cost per share", "price paid", "unit cost", "avg_cost"),
      total: find("cost basis", "total cost", "cost_basis"), date: find("acquired", "date", "purchase"),
    };
    lines.shift();
    if (cols.symbol < 0 || cols.shares < 0) return { holdings: [], errors: ["The header needs a symbol (or ticker) column and a shares (or quantity) column."] };
  }
  const bySymbol = new Map<string, Holding & { cost: number | null }>();
  lines.forEach((l, i) => {
    const c = split(l);
    const symbol = (c[cols.symbol] ?? "").toUpperCase().replace(/[^A-Z0-9.\-/]/g, "");
    const shares = num(c[cols.shares]);
    if (!symbol || !Number.isFinite(shares) || shares <= 0) { errors.push(`Line ${i + 1}: needs a symbol and a positive number of shares.`); return; }
    let avg = cols.avg >= 0 ? num(c[cols.avg]) : NaN;
    const total = cols.total >= 0 ? num(c[cols.total]) : NaN;
    if (!Number.isFinite(avg) && Number.isFinite(total)) avg = total / shares;
    const d = cols.date >= 0 ? (c[cols.date] ?? "") : "";
    const acquired = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d) ? isoFromUs(d) : null;
    const prev = bySymbol.get(symbol);
    const cost = Number.isFinite(avg) && avg > 0 ? avg * shares : null;
    if (prev) {
      prev.cost = prev.cost != null && cost != null ? prev.cost + cost : null;
      prev.shares += shares;
      prev.acquired = prev.acquired && acquired ? (prev.acquired < acquired ? prev.acquired : acquired) : null;
    } else bySymbol.set(symbol, { symbol, shares, avgCost: null, acquired, cost });
  });
  const holdings = [...bySymbol.values()].map(({ cost, ...h }) => ({ ...h, avgCost: cost != null ? cost / h.shares : null }));
  if (holdings.length > MAX_HOLDINGS) { errors.push(`Only the first ${MAX_HOLDINGS} holdings are analyzed.`); holdings.length = MAX_HOLDINGS; }
  return { holdings, errors };
}

/** Comma-separated cells, honoring double quotes ("$1,500.00" stays one cell). */
function csvCells(l: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (const ch of l) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function isoFromUs(d: string) {
  const [m, dd, y] = d.split("/").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export interface Context {
  symbol: string; name: string; asset_subtype: string | null; close: number | null; prev_close: number | null;
  trend: string | null; glance_pattern: string | null; glance_complete: boolean | null; glance_wave: string | null;
  glance_wave_dir: string | null; glance_score: number | null; glance_hold: number | null;
  setup_side: string | null; setup_kind: string | null; setup_rr: number | null; weekly_dir: string | null;
}

export interface Position {
  symbol: string; name: string; type: "stock" | "etf" | "other"; shares: number; close: number; value: number; weight: number;
  dayChange: number | null; r3m: number | null; vol: number | null; beta: number | null;
  cost: number | null; gain: number | null; gainPct: number | null; term: "long" | "short" | null;
  ctx: Context;
}

export interface XRay {
  asOf: string | null;
  total: number;
  positions: Position[];
  unknown: string[];
  noPrice: string[];
  concentration: { top: Position | null; top5: number; effective: number; over10: Position[]; over20: Position[] };
  mix: { stocks: number; etfs: number; other: number };
  risk: { vol: number | null; beta: number | null; drawdown: number | null; r3m: number | null; spy3m: number | null };
  pairs: { a: string; b: string; corr: number }[];
  tax: { costKnown: number; gain: number; gains: Position[]; losses: Position[]; shortTerm: number; longTerm: number } | null;
  structure: { up: number; down: number; none: number; setups: Position[]; nearLevel: Position[] };
}

/**
 * Measure a portfolio. Weights are today's market values; the portfolio's history is today's weights
 * applied to each holding's past returns (a constant-weight back-cast, not the account's actual record).
 */
export function xray(holdings: Holding[], ctx: Context[], closes: Map<string, Close[]>, today = new Date()): XRay {
  const bySym = new Map(ctx.map((c) => [c.symbol, c]));
  const unknown = holdings.filter((h) => !bySym.has(h.symbol)).map((h) => h.symbol);
  const noPrice = holdings.filter((h) => bySym.has(h.symbol) && !(bySym.get(h.symbol)!.close! > 0)).map((h) => h.symbol);
  const spy = closes.get("SPY") ?? [];
  const spyR = dailyReturns(spy);
  const priced = holdings.filter((h) => (bySym.get(h.symbol)?.close ?? 0) > 0);
  const total = priced.reduce((a, h) => a + h.shares * bySym.get(h.symbol)!.close!, 0);
  const positions: Position[] = priced.map((h): Position => {
    const c = bySym.get(h.symbol)!;
    const bars = closes.get(h.symbol) ?? [];
    const value = h.shares * c.close!;
    const cost = h.avgCost != null ? h.avgCost * h.shares : null;
    const days = h.acquired ? (today.getTime() - Date.parse(h.acquired)) / 864e5 : null;
    return {
      symbol: h.symbol, name: c.name, type: c.asset_subtype === "etf" ? "etf" : c.asset_subtype === "common" ? "stock" : "other",
      shares: h.shares, close: c.close!, value, weight: total ? value / total : 0,
      dayChange: c.prev_close ? c.close! / c.prev_close - 1 : null,
      r3m: periodReturn(bars, 63), vol: volatility(bars, TRADING_DAYS), beta: beta(dailyReturns(bars), spyR),
      cost, gain: cost != null ? value - cost : null, gainPct: cost ? value / cost - 1 : null,
      term: days == null ? null : days > 365 ? "long" : "short", ctx: c,
    };
  }).sort((a, b) => b.value - a.value);

  // portfolio back-cast from today's weights
  const series = new Map<string, number>();
  for (const p of positions) for (const [d, r] of dailyReturns(closes.get(p.symbol) ?? [])) series.set(d, (series.get(d) ?? 0) + p.weight * r);
  const dates = [...series.keys()].sort();
  const daySets = positions.map((p) => new Set((closes.get(p.symbol) ?? []).map((b) => b.ts.slice(0, 10))));
  // only sessions every holding traded, so a missing day doesn't read as a zero return
  const covered = (d: string) => daySets.every((set) => set.has(d));
  const usable = dates.filter(covered).slice(-TRADING_DAYS);
  const port = new Map(usable.map((d) => [d, series.get(d)!]));
  let level = 100;
  const curve: Close[] = [{ ts: usable[0] ?? "", close: 100 }, ...usable.map((d) => ({ ts: d, close: (level *= 1 + port.get(d)!) }))];

  const pairs: XRay["pairs"] = [];
  const top = positions.slice(0, 25);
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
    const c = correlation(dailyReturns(closes.get(top[i].symbol) ?? []), dailyReturns(closes.get(top[j].symbol) ?? []));
    if (c != null) pairs.push({ a: top[i].symbol, b: top[j].symbol, corr: c });
  }
  pairs.sort((x, y) => y.corr - x.corr);

  const withCost = positions.filter((p) => p.cost != null);
  const hhi = positions.reduce((a, p) => a + p.weight ** 2, 0);
  const mixOf = (t: Position["type"]) => positions.filter((p) => p.type === t).reduce((a, p) => a + p.weight, 0);
  return {
    asOf: spy.at(-1)?.ts ?? null,
    total, positions, unknown, noPrice,
    concentration: {
      top: positions[0] ?? null, top5: positions.slice(0, 5).reduce((a, p) => a + p.weight, 0), effective: hhi ? 1 / hhi : 0,
      over10: positions.filter((p) => p.weight > 0.1), over20: positions.filter((p) => p.weight > 0.2),
    },
    mix: { stocks: mixOf("stock"), etfs: mixOf("etf"), other: mixOf("other") },
    risk: {
      vol: port.size >= 60 ? volatility(curve, TRADING_DAYS) : null,
      beta: port.size >= 60 ? beta(port, spyR) : null,
      drawdown: port.size >= 60 ? maxDrawdown(curve, TRADING_DAYS) : null,
      r3m: port.size >= 63 ? periodReturn(curve, 63) : null, spy3m: periodReturn(spy, 63),
    },
    pairs: pairs.slice(0, 5),
    tax: withCost.length ? {
      costKnown: withCost.length, gain: withCost.reduce((a, p) => a + p.gain!, 0),
      gains: withCost.filter((p) => p.gain! > 0).sort((a, b) => b.gain! - a.gain!).slice(0, 5),
      losses: withCost.filter((p) => p.gain! < 0).sort((a, b) => a.gain! - b.gain!),
      shortTerm: positions.filter((p) => p.term === "short").length, longTerm: positions.filter((p) => p.term === "long").length,
    } : null,
    structure: {
      up: positions.filter((p) => p.ctx.glance_wave_dir === "up").reduce((a, p) => a + p.weight, 0),
      down: positions.filter((p) => p.ctx.glance_wave_dir === "down").reduce((a, p) => a + p.weight, 0),
      none: positions.filter((p) => !p.ctx.glance_wave_dir).reduce((a, p) => a + p.weight, 0),
      setups: positions.filter((p) => p.ctx.setup_side),
      nearLevel: positions.filter((p) => p.ctx.glance_hold != null && Math.abs(p.ctx.glance_hold / p.close - 1) <= 0.03),
    },
  };
}
