/**
 * Portfolio X-Ray workspace: every figure on /portfolio, computed from the holdings and stored
 * end-of-day closes. Pure; the API route supplies the data. Nothing here is estimated without data:
 * a metric that needs data Viridia doesn't hold (dividends, fundamentals, long history) is returned
 * as null with the reason, never filled in.
 *
 * Conventions
 *  - Weights are today's market values. History is a constant-weight back-cast: today's weights applied
 *    to each holding's past daily returns. It is not the account's actual record.
 *  - Cash earns the T-bill ETF (BIL) return in the back-cast.
 *  - Risk statistics use the last 252 sessions every modeled holding traded.
 */
import { TRADING_DAYS, type Close } from "@/lib/analysis/stats";
import { PATTERN_LABEL, type CandidatePattern } from "@/lib/analysis/candidates";
import { CASH_SYMBOL, driftOf, type Context, type DriftRow, type Holding } from "./xray";
import { covariance, dot, eigenSymmetric, matVec, mean, ols, styleWeights } from "./linalg";

// ---------------------------------------------------------------- proxies

export const SECTOR_ETFS: { symbol: string; sector: string }[] = [
  { symbol: "XLK", sector: "Technology" }, { symbol: "XLC", sector: "Communication" }, { symbol: "XLY", sector: "Consumer discretionary" },
  { symbol: "XLP", sector: "Consumer staples" }, { symbol: "XLV", sector: "Health care" }, { symbol: "XLF", sector: "Financials" },
  { symbol: "XLI", sector: "Industrials" }, { symbol: "XLE", sector: "Energy" }, { symbol: "XLB", sector: "Materials" },
  { symbol: "XLU", sector: "Utilities" }, { symbol: "XLRE", sector: "Real estate" },
];
/** Non-equity style assets so bond and cash-like funds aren't forced into an equity sector. */
export const STYLE_EXTRA: { symbol: string; sector: string }[] = [{ symbol: "IEF", sector: "Treasuries" }, { symbol: "BIL", sector: "T-bills and cash" }];
export const FACTORS: { key: FactorKey; label: string; long: string; short: string; means: string }[] = [
  { key: "market", label: "Market beta", long: "SPY", short: "BIL", means: "S&P 500 return over T-bills" },
  { key: "size", label: "Size", long: "IWM", short: "IWB", means: "small caps (Russell 2000) minus large caps (Russell 1000); positive is a small-cap tilt" },
  { key: "value", label: "Value / growth", long: "IWD", short: "IWF", means: "Russell 1000 Value minus Growth; positive is a value tilt, negative a growth tilt" },
  { key: "momentum", label: "Momentum", long: "MTUM", short: "SPY", means: "MSCI USA Momentum minus the S&P 500" },
  { key: "quality", label: "Quality", long: "QUAL", short: "SPY", means: "MSCI USA Quality minus the S&P 500" },
  { key: "lowvol", label: "Low volatility", long: "USMV", short: "SPY", means: "MSCI USA Minimum Volatility minus the S&P 500; negative is a high-volatility tilt" },
];
export type FactorKey = "market" | "size" | "value" | "momentum" | "quality" | "lowvol";
/** Every proxy series the workspace needs besides the holdings. */
export const PROXY_SYMBOLS = [...new Set(["SPY", "QQQ", "AGG", "BIL", "IEF", "XLK", "IWM", "IWB", "IWD", "IWF", "MTUM", "QUAL", "USMV", ...SECTOR_ETFS.map((s) => s.symbol)])];

/** Rates scenarios are modeled through the 7–10 year Treasury ETF with an assumed duration of about 7 years. */
export const IEF_DURATION = 7;

// ---------------------------------------------------------------- types

/** "SPY 60, AGG 40" or "SPY:0.6 AGG:0.4" → fractions summing to 1; null when unreadable. */
export function parseCustomBenchmark(s: string): Record<string, number> | null {
  const pairs = [...s.toUpperCase().matchAll(/([A-Z][A-Z0-9.\-]{0,11})\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%?/g)].map((m) => [m[1], Number(m[2])] as const).filter(([, v]) => v > 0);
  const sum = pairs.reduce((a, [, v]) => a + v, 0);
  return pairs.length && sum > 0 ? Object.fromEntries(pairs.map(([k, v]) => [k, v / sum])) : null;
}


export interface Benchmark { id: string; label: string; weights: Record<string, number> }
export const STANDARD_BENCHMARKS: Benchmark[] = [
  { id: "spy", label: "S&P 500 (SPY)", weights: { SPY: 1 } },
  { id: "qqq", label: "Nasdaq-100 (QQQ)", weights: { QQQ: 1 } },
  { id: "6040", label: "60/40 (SPY / AGG)", weights: { SPY: 0.6, AGG: 0.4 } },
];

export type AssetClass = "stock" | "equity_fund" | "bond_fund" | "cash_fund" | "cash" | "other";
export const ASSET_LABEL: Record<AssetClass, string> = {
  stock: "Stocks", equity_fund: "Equity funds", bond_fund: "Bond funds", cash_fund: "T-bill and money funds", cash: "Cash", other: "Other",
};

export interface WsPosition {
  symbol: string; name: string; asset: AssetClass; shares: number; close: number; value: number; weight: number;
  dayChange: number | null; dayPnl: number | null;
  cost: number | null; gain: number | null; gainPct: number | null;
  /** Estimated sector mix from returns (style analysis); null without 60 sessions. */
  style: { sector: string; w: number }[] | null; styleR2: number | null; sector: string;
  ctx: Context | null; zone: { low: number; high: number } | null;
}

export interface RiskRow {
  symbol: string; weight: number; vol: number | null; beta: number | null; mdd: number | null;
  /** Share of modeled portfolio variance (sums to 1 across modeled holdings). */
  contribution: number | null; corrPortfolio: number | null; corrBenchmark: number | null;
}

export interface Insight { id: string; text: string; tone?: "warn" | "pos" | "neg" }

export interface FactorRow { key: FactorKey | "profitability"; label: string; loading: number | null; t: number | null; means: string; note?: string }

export interface Scenario {
  id: string; label: string; kind: "modeled" | "historical"; definition: string;
  portfolio: number | null; benchmark: number | null; coverage: number;
  contributions: { symbol: string; impact: number | null; contribution: number | null }[];
}

export interface StructureRow {
  symbol: string; weight: number; trend: string | null; pattern: string | null; motive: boolean | null; wave: string | null; complete: boolean | null;
  dir: string | null; score: number | null; zone: { low: number; high: number } | null; zoneDist: number | null;
  invalidation: number | null; invalidationDist: number | null; degree: string | null;
}

export interface TaxLotRow {
  symbol: string; shares: number; acquired: string | null; costPerShare: number; basis: number; value: number; gain: number;
  term: "short" | "long" | null; daysToLong: number | null;
}

export interface BenchmarkStats {
  id: string; label: string; r1y: number | null; vol: number | null; mdd: number | null; beta: number | null; sharpe: number | null;
  corr: number | null; topSector: { sector: string; w: number } | null; factors: Partial<Record<FactorKey, number>>; uptrend: number | null;
}

export interface Workspace {
  asOf: string | null; today: string;
  total: number; positions: WsPosition[]; unknown: string[]; noPrice: string[]; unmodeled: string[];
  metrics: {
    value: number; dayPnl: number | null; dayPct: number | null; ytd: number | null; r1y: number | null; vol: number | null; beta: number | null;
    mdd: number | null; sharpe: number | null; incomeYield: null; holdings: number; cash: number; historyDays: number;
  };
  perf: { dates: string[]; portfolio: number[]; benchmarks: Record<string, number[]> };
  allocation: { asset: AssetClass; weight: number }[];
  sectors: { sector: string; weight: number }[];
  concentration: { top5: number; effective: number; largest: WsPosition | null };
  insights: Insight[];
  risk: { rows: RiskRow[]; flagged: string[]; enb: number | null; topShare: { n: number; share: number } | null };
  correlation: { symbols: string[]; matrix: (number | null)[][]; clusters: { name: string; symbols: string[]; weight: number; avgCorr: number }[] };
  factors: { rows: FactorRow[]; r2: number | null; alpha: number | null; n: number };
  stress: Scenario[];
  structure: {
    trend: { uptrend: number; mixed: number; downtrend: number; unknown: number };
    motive: number; corrective: number; noCount: number; wave3: number; wave5: number;
    nearInvalidation: { weight: number; value: number; symbols: string[] };
    rows: StructureRow[];
  };
  tax: {
    lots: TaxLotRow[]; gains: number; losses: number; shortTerm: number; longTerm: number; unknownTerm: number;
    byPosition: { symbol: string; basis: number; value: number; gain: number }[];
    positionsWithLoss: number; turningLong30: number; lotsWithoutDate: number; costCoverage: number;
  } | null;
  benchmarks: BenchmarkStats[];
  drift: DriftRow[] | null;
}

// ---------------------------------------------------------------- helpers

const BOND_RX = /treasury|bond|aggregate|municipal|muni\b|fixed income|credit|corporate|high yield|tips\b|mortgage|income etf/i;
const CASHFUND_RX = /t-bill|treasury bill|0-3 month|0-1 year|1-3 month|money market|ultra.?short/i;

function assetOf(c: Context | null, cash: boolean): AssetClass {
  if (cash) return "cash";
  if (!c) return "other";
  if (c.asset_subtype === "etf") return CASHFUND_RX.test(c.name) ? "cash_fund" : BOND_RX.test(c.name) ? "bond_fund" : "equity_fund";
  return c.asset_subtype === "common" ? "stock" : "other";
}

const MOTIVE = new Set(["impulse", "leading_diagonal", "ending_diagonal"]);

/** Daily returns keyed by date. */
function returnsOf(bars: Close[] | undefined): Map<string, number> {
  const m = new Map<string, number>();
  if (!bars) return m;
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1].close, b = bars[i].close;
    if (a > 0 && b > 0) m.set(bars[i].ts.slice(0, 10), b / a - 1);
  }
  return m;
}

const std = (x: number[]) => {
  if (x.length < 2) return NaN;
  const m = mean(x);
  return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1));
};
function corr(x: number[], y: number[]): number | null {
  if (x.length < 60) return null;
  const mx = mean(x), my = mean(y);
  let c = 0, vx = 0, vy = 0;
  for (let i = 0; i < x.length; i++) { c += (x[i] - mx) * (y[i] - my); vx += (x[i] - mx) ** 2; vy += (y[i] - my) ** 2; }
  return vx > 0 && vy > 0 ? c / Math.sqrt(vx * vy) : null;
}
function betaOf(x: number[], y: number[]): number | null {
  if (x.length < 60) return null;
  const mx = mean(x), my = mean(y);
  let c = 0, vy = 0;
  for (let i = 0; i < x.length; i++) { c += (x[i] - mx) * (y[i] - my); vy += (y[i] - my) ** 2; }
  return vy > 0 ? c / vy : null;
}
function levels(r: number[]): number[] {
  let l = 1;
  return [1, ...r.map((v) => (l *= 1 + v))];
}
function mddOf(r: number[]): number | null {
  if (r.length < 20) return null;
  let peak = 1, l = 1, dd = 0;
  for (const v of r) { l *= 1 + v; peak = Math.max(peak, l); dd = Math.min(dd, l / peak - 1); }
  return dd;
}
const annVol = (r: number[]) => (r.length >= 20 ? std(r) * Math.sqrt(TRADING_DAYS) : null);
function sharpeOf(r: number[], rf: number[]): number | null {
  if (r.length < 120) return null;
  const ex = r.map((v, i) => v - (rf[i] ?? 0));
  const s = std(ex);
  return s > 0 ? (mean(ex) * TRADING_DAYS) / (s * Math.sqrt(TRADING_DAYS)) : null;
}
const addDays = (iso: string, d: number) => new Date(Date.parse(iso) + d * 864e5).toISOString().slice(0, 10);
const oneYearOn = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};
const pctTxt = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

// ---------------------------------------------------------------- build

export interface WorkspaceInput {
  holdings: Holding[];
  ctx: Context[];
  zones: { symbol: string; zone_low: number | null; zone_high: number | null }[];
  closes: Map<string, Close[]>;
  today?: Date;
  targets?: Record<string, number> | null;
  /** Extra benchmarks (custom mix, another saved portfolio) besides SPY, QQQ and 60/40. */
  benchmarks?: Benchmark[];
}

export function buildWorkspace(inp: WorkspaceInput): Workspace {
  const today = inp.today ?? new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const byCtx = new Map(inp.ctx.map((c) => [c.symbol, c]));
  const byZone = new Map(inp.zones.map((z) => [z.symbol, z]));
  const spyBars = inp.closes.get("SPY") ?? [];
  const asOf = spyBars.at(-1)?.ts.slice(0, 10) ?? null;

  const unknown = inp.holdings.filter((h) => !h.cash && !byCtx.has(h.symbol)).map((h) => h.symbol);
  const noPrice = inp.holdings.filter((h) => !h.cash && byCtx.has(h.symbol) && !((byCtx.get(h.symbol)!.close ?? 0) > 0)).map((h) => h.symbol);
  const priced = inp.holdings.filter((h) => h.cash || (byCtx.get(h.symbol)?.close ?? 0) > 0);
  const valueOf = (h: Holding) => (h.cash ? h.shares : h.shares * byCtx.get(h.symbol)!.close!);
  const total = priced.reduce((a, h) => a + valueOf(h), 0);

  // style analysis inputs (sector ETFs + Treasuries + T-bills), aligned on SPY's calendar
  const styleAssets = [...SECTOR_ETFS, ...STYLE_EXTRA];
  const styleRet = styleAssets.map((s) => returnsOf(inp.closes.get(s.symbol)));
  const calendar = [...returnsOf(spyBars).keys()];
  const last252 = calendar.slice(-TRADING_DAYS);

  function styleFor(r: Map<string, number>) {
    const days = last252.filter((d) => r.has(d) && styleRet.every((m) => m.has(d)));
    if (days.length < 60) return null;
    const res = styleWeights(days.map((d) => r.get(d)!), days.map((d) => styleRet.map((m) => m.get(d)!)));
    if (!res) return null;
    const mix = styleAssets.map((s, i) => ({ sector: s.sector, w: res.w[i] })).filter((x) => x.w >= 0.005).sort((a, b) => b.w - a.w);
    return { mix, r2: res.r2 };
  }

  const holdRet = new Map<string, Map<string, number>>();
  const bilRet = returnsOf(inp.closes.get("BIL"));
  const positions: WsPosition[] = priced.map((h): WsPosition => {
    const c = h.cash ? null : byCtx.get(h.symbol)!;
    const close = h.cash ? 1 : c!.close!;
    const value = valueOf(h);
    const r = h.cash ? bilRet : returnsOf(inp.closes.get(h.symbol));
    holdRet.set(h.symbol, r);
    const st = h.cash ? { mix: [{ sector: "T-bills and cash", w: 1 }], r2: 1 } : styleFor(r);
    const cost = h.cash ? value : h.avgCost != null ? h.avgCost * h.shares : null;
    const z = byZone.get(h.symbol);
    const dayChange = h.cash ? 0 : c!.prev_close ? close / c!.prev_close - 1 : null;
    return {
      symbol: h.symbol, name: h.cash ? "Cash" : c!.name, asset: assetOf(c, !!h.cash), shares: h.shares, close, value, weight: total ? value / total : 0,
      dayChange, dayPnl: h.cash ? 0 : c!.prev_close ? h.shares * (close - c!.prev_close) : null,
      cost, gain: h.cash || cost == null ? (h.cash ? 0 : null) : value - cost, gainPct: !h.cash && cost ? value / cost - 1 : null,
      style: st?.mix ?? null, styleR2: st?.r2 ?? null,
      sector: st?.mix[0] && (st.r2 >= 0.25 || h.cash) ? st.mix[0].sector : "Unclassified",
      ctx: c, zone: z && z.zone_low != null && z.zone_high != null ? { low: z.zone_low, high: z.zone_high } : null,
    };
  }).sort((a, b) => b.value - a.value);

  // ---------------------------------------------------------------- back-cast
  const modeled = positions.filter((p) => p.asset === "cash" || (holdRet.get(p.symbol)?.size ?? 0) >= 60);
  const unmodeled = positions.filter((p) => !modeled.includes(p)).map((p) => p.symbol);
  const mw = modeled.reduce((a, p) => a + p.weight, 0);
  const W = calendar.filter((d) => modeled.every((p) => holdRet.get(p.symbol)!.has(d)));
  const portRet = W.map((d) => modeled.reduce((a, p) => a + (p.weight / (mw || 1)) * holdRet.get(p.symbol)!.get(d)!, 0));
  const W1 = W.slice(-TRADING_DAYS), P1 = portRet.slice(-TRADING_DAYS);
  const spyRet = returnsOf(spyBars);
  const spy1 = W1.map((d) => spyRet.get(d) ?? 0);
  const rf1 = W1.map((d) => bilRet.get(d) ?? 0);

  const curve = levels(portRet);
  const ytdStart = W.filter((d) => d < `${today.getUTCFullYear()}-01-01`).length - 1;
  const ytd = ytdStart >= 0 && W.length ? curve[curve.length - 1] / curve[ytdStart + 1] - 1 : null;
  const r1y = W.length >= TRADING_DAYS ? curve[curve.length - 1] / curve[curve.length - 1 - TRADING_DAYS] - 1 : null;

  // benchmark series on the same dates
  const benchSeries = (b: Benchmark): { r: number[]; ok: boolean } => {
    const parts = Object.entries(b.weights).filter(([, v]) => v > 0);
    const sum = parts.reduce((a, [, v]) => a + v, 0) || 1;
    const rets = parts.map(([s, v]) => [s === CASH_SYMBOL ? bilRet : returnsOf(inp.closes.get(s)), v / sum] as const);
    const ok = rets.every(([m]) => m.size >= 60);
    return { r: W1.map((d) => rets.reduce((a, [m, v]) => a + v * (m.get(d) ?? 0), 0)), ok };
  };
  const allBench = [...STANDARD_BENCHMARKS, ...(inp.benchmarks ?? [])];
  const perfBench: Record<string, number[]> = {};
  const benchR = new Map<string, number[]>();
  for (const b of allBench) {
    const s = benchSeries(b);
    if (!s.ok) continue;
    benchR.set(b.id, s.r);
    perfBench[b.id] = levels(s.r).map((v) => +(v * 100).toFixed(3));
  }

  // ---------------------------------------------------------------- risk model
  const modeledRisky = modeled;
  const R = W1.map((d) => modeledRisky.map((p) => holdRet.get(p.symbol)!.get(d)!));
  const wv = modeledRisky.map((p) => p.weight / (mw || 1));
  let rows: RiskRow[] = [];
  let enb: number | null = null;
  let topShare: Workspace["risk"]["topShare"] = null;
  if (R.length >= 60 && modeledRisky.length) {
    const S = covariance(R);
    const Sw = matVec(S, wv);
    const varP = dot(wv, Sw);
    rows = modeledRisky.map((p, i) => {
      const x = R.map((r) => r[i]);
      return {
        symbol: p.symbol, weight: p.weight, vol: annVol(x), beta: p.asset === "cash" ? 0 : betaOf(x, spy1), mdd: p.asset === "cash" ? 0 : mddOf(x),
        contribution: varP > 0 ? (wv[i] * Sw[i]) / varP : null,
        corrPortfolio: p.asset === "cash" ? null : corr(x, P1), corrBenchmark: p.asset === "cash" ? null : corr(x, spy1),
      };
    });
    if (varP > 0) {
      const { values, vectors } = eigenSymmetric(S);
      const p = values.map((lam, k) => {
        const e = vectors.map((r) => r[k]);
        return (dot(e, wv) ** 2 * Math.max(0, lam)) / varP;
      }).filter((v) => v > 1e-12);
      const s = p.reduce((a, v) => a + v, 0);
      enb = Math.exp(-p.reduce((a, v) => a + (v / s) * Math.log(v / s), 0));
      const sorted = rows.map((r) => r.contribution ?? 0).sort((a, b) => b - a);
      let acc = 0, n = 0;
      for (const v of sorted) { acc += v; n++; if (acc >= 0.5) break; }
      topShare = { n: Math.max(n, Math.min(3, sorted.length)), share: sorted.slice(0, Math.max(n, Math.min(3, sorted.length))).reduce((a, v) => a + v, 0) };
    }
  }
  const flagged = rows.filter((r) => r.contribution != null && r.contribution - r.weight >= 0.03 && r.contribution >= 1.25 * r.weight).map((r) => r.symbol);

  // ---------------------------------------------------------------- correlation
  const risky = modeledRisky.filter((p) => p.asset !== "cash");
  const colOf = (sym: string) => W1.map((d) => holdRet.get(sym)!.get(d)!);
  const cols = new Map(risky.map((p) => [p.symbol, colOf(p.symbol)]));
  const cor = (a: string, b: string) => (a === b ? 1 : corr(cols.get(a)!, cols.get(b)!));
  const shown = risky.slice(0, 30).map((p) => p.symbol);
  const matrix = shown.map((a) => shown.map((b) => cor(a, b)));
  // average-linkage clusters of holdings that move together
  let groups = risky.map((p) => [p.symbol]);
  const link = (g: string[], h: string[]) => {
    let s = 0, n = 0;
    for (const a of g) for (const b of h) { const c = cor(a, b); if (c != null) { s += c; n++; } }
    return n ? s / n : -1;
  };
  for (;;) {
    let best = -1, bi = -1, bj = -1;
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const l = link(groups[i], groups[j]);
      if (l > best) { best = l; bi = i; bj = j; }
    }
    if (best < CLUSTER_CORR || bi < 0) break;
    groups = [...groups.filter((_, k) => k !== bi && k !== bj), [...groups[bi], ...groups[bj]]];
  }
  const posOf = new Map(positions.map((p) => [p.symbol, p]));
  const clusters = groups.filter((g) => g.length >= 2).map((g) => {
    const mix = new Map<string, number>();
    for (const s of g) for (const x of posOf.get(s)!.style ?? []) mix.set(x.sector, (mix.get(x.sector) ?? 0) + x.w / g.length);
    const top = [...mix].sort((a, b) => b[1] - a[1]);
    const name = !top.length ? "Co-moving holdings" : top[0][1] >= 0.5 || !top[1] ? `${top[0][0]} cluster` : `${top[0][0]} / ${top[1][0]} cluster`;
    let s = 0, n = 0;
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) { const c = cor(g[i], g[j]); if (c != null) { s += c; n++; } }
    const sorted = [...g].sort((a, b) => posOf.get(b)!.weight - posOf.get(a)!.weight);
    return { name, symbols: sorted, weight: g.reduce((a, x) => a + posOf.get(x)!.weight, 0), avgCorr: n ? s / n : 0 };
  }).sort((a, b) => b.weight - a.weight);

  // ---------------------------------------------------------------- factors
  const fRet = new Map(PROXY_SYMBOLS.map((s) => [s, returnsOf(inp.closes.get(s))]));
  const fDays = W1.filter((d) => FACTORS.every((f) => fRet.get(f.long)!.has(d) && fRet.get(f.short)!.has(d)));
  const fx = fDays.map((d) => FACTORS.map((f) => fRet.get(f.long)!.get(d)! - fRet.get(f.short)!.get(d)!));
  const regress = (series: Map<string, number>) => ols(fDays.map((d) => (series.get(d) ?? 0) - (bilRet.get(d) ?? 0)), fx);
  const portMap = new Map(W1.map((d, i) => [d, P1[i]]));
  const fr = fDays.length >= 120 ? regress(portMap) : null;
  const factorRows: FactorRow[] = [
    ...FACTORS.map((f, i) => ({ key: f.key, label: f.label, loading: fr ? fr.coef[i + 1] : null, t: fr ? fr.t[i + 1] : null, means: f.means })),
    { key: "profitability" as const, label: "Profitability", loading: null, t: null, means: "Operating profitability", note: "Not estimated: needs company fundamentals, which Viridia doesn't load yet." },
  ];

  // ---------------------------------------------------------------- stress
  const betaTo = (x: Map<string, number>, proxy: string) => {
    const pr = fRet.get(proxy) ?? returnsOf(inp.closes.get(proxy));
    const days = W1.filter((d) => x.has(d) && pr.has(d));
    return betaOf(days.map((d) => x.get(d)!), days.map((d) => pr.get(d)!));
  };
  const modeledScenario = (id: string, label: string, proxy: string, shock: number, definition: string): Scenario => {
    const contributions = positions.map((p) => {
      const b = p.asset === "cash" ? 0 : betaTo(holdRet.get(p.symbol)!, proxy);
      return { symbol: p.symbol, impact: b == null ? null : b * shock, contribution: b == null ? null : p.weight * b * shock };
    });
    const known = contributions.filter((c) => c.contribution != null);
    const b = proxy === "SPY" ? 1 : betaTo(spyRet, proxy);
    return {
      id, label, kind: "modeled", definition,
      portfolio: known.length ? known.reduce((a, c) => a + c.contribution!, 0) : null,
      benchmark: b == null ? null : b * shock,
      coverage: positions.filter((p, i) => contributions[i].contribution != null).reduce((a, p) => a + p.weight, 0),
      contributions: contributions.sort((x, y) => (x.contribution ?? 0) - (y.contribution ?? 0)),
    };
  };
  const replay = (id: string, label: string, anchor: string, what: string): Scenario | null => {
    const bars = inp.closes.get(anchor) ?? [];
    if (bars.length < 60) return null;
    let peak = 0, best = 0, from = 0, to = 0;
    for (let i = 1; i < bars.length; i++) {
      if (bars[i].close > bars[peak].close) peak = i;
      const dd = bars[i].close / bars[peak].close - 1;
      if (dd < best) { best = dd; from = peak; to = i; }
    }
    if (best > -0.03) return null;
    const d0 = bars[from].ts.slice(0, 10), d1 = bars[to].ts.slice(0, 10);
    const retOver = (sym: string) => {
      const b = sym === CASH_SYMBOL ? inp.closes.get("BIL") : inp.closes.get(sym);
      const a = b?.find((x) => x.ts.slice(0, 10) === d0), z = b?.find((x) => x.ts.slice(0, 10) === d1);
      return a && z && a.close > 0 ? z.close / a.close - 1 : null;
    };
    const contributions = positions.map((p) => {
      const r = retOver(p.symbol);
      return { symbol: p.symbol, impact: r, contribution: r == null ? null : p.weight * r };
    });
    const known = contributions.filter((c) => c.contribution != null);
    const spyR = retOver("SPY");
    return {
      id, label: `${label} (${d0} to ${d1})`, kind: "historical",
      definition: `Replays each holding's actual return from ${d0} to ${d1}, the ${what} in Viridia's stored history, at today's weights.`,
      portfolio: known.length ? known.reduce((a, c) => a + c.contribution!, 0) : null, benchmark: spyR,
      coverage: positions.filter((_, i) => contributions[i].contribution != null).reduce((a, p) => a + p.weight, 0),
      contributions: contributions.sort((x, y) => (x.contribution ?? 0) - (y.contribution ?? 0)),
    };
  };
  const stress: Scenario[] = [
    replay("hist_spy", "Largest S&P 500 drawdown", "SPY", "largest peak-to-trough fall in SPY"),
    replay("hist_ief", "Largest Treasury drawdown", "IEF", "largest peak-to-trough fall in IEF (rising 7–10 year yields)"),
    modeledScenario("spx10", "S&P 500 −10%", "SPY", -0.1, "Each holding's one-year beta to SPY × −10%."),
    modeledScenario("ndx20", "Nasdaq-100 −20%", "QQQ", -0.2, "Each holding's one-year beta to QQQ × −20%."),
    modeledScenario("tech20", "Technology −20%", "XLK", -0.2, "Each holding's one-year beta to XLK (Technology Select Sector SPDR) × −20%."),
    modeledScenario("rates_up", "Rates +100 bp", "IEF", -IEF_DURATION / 100, `Modeled as IEF −${IEF_DURATION.toFixed(1)}% (a duration of about ${IEF_DURATION} years), times each holding's one-year beta to IEF.`),
    modeledScenario("rates_dn", "Rates −100 bp", "IEF", IEF_DURATION / 100, `Modeled as IEF +${IEF_DURATION.toFixed(1)}%, times each holding's one-year beta to IEF.`),
  ].filter((s): s is Scenario => !!s);

  // ---------------------------------------------------------------- structure
  const structRows: StructureRow[] = positions.filter((p) => p.asset !== "cash").map((p) => {
    const c = p.ctx!;
    const inv = c.glance_hold ?? null;
    const zoneDist = p.zone ? (p.close >= p.zone.low && p.close <= p.zone.high ? 0 : (p.close < p.zone.low ? p.zone.low : p.zone.high) / p.close - 1) : null;
    return {
      symbol: p.symbol, weight: p.weight, trend: c.trend, pattern: c.glance_pattern, motive: c.glance_pattern ? MOTIVE.has(c.glance_pattern) : null,
      wave: c.glance_wave, complete: c.glance_complete, dir: c.glance_wave_dir, score: c.glance_score, zone: p.zone, zoneDist,
      invalidation: inv, invalidationDist: inv != null && p.close ? inv / p.close - 1 : null, degree: c.glance_degree ?? null,
    };
  });
  const wsum = (f: (r: StructureRow) => boolean) => structRows.filter(f).reduce((a, r) => a + r.weight, 0);
  const near = structRows.filter((r) => r.invalidationDist != null && Math.abs(r.invalidationDist) <= NEAR_INVALIDATION);

  // ---------------------------------------------------------------- tax
  const lots: TaxLotRow[] = [];
  for (const h of priced) {
    if (h.cash) continue;
    const close = byCtx.get(h.symbol)!.close!;
    for (const l of h.lots ?? [{ shares: h.shares, cost: h.avgCost, acquired: h.acquired }]) {
      if (l.cost == null) continue;
      const lt = l.acquired ? oneYearOn(l.acquired) : null;
      const term = !l.acquired ? null : todayIso > lt! ? "long" : "short";
      const daysToLong = term === "short" ? Math.round((Date.parse(addDays(lt!, 1)) - Date.parse(todayIso)) / 864e5) : null;
      lots.push({ symbol: h.symbol, shares: l.shares, acquired: l.acquired, costPerShare: l.cost, basis: l.cost * l.shares, value: close * l.shares, gain: (close - l.cost) * l.shares, term, daysToLong });
    }
  }
  const byPos = new Map<string, { basis: number; value: number; gain: number }>();
  for (const l of lots) {
    const b = byPos.get(l.symbol) ?? { basis: 0, value: 0, gain: 0 };
    b.basis += l.basis; b.value += l.value; b.gain += l.gain;
    byPos.set(l.symbol, b);
  }
  const riskyValue = positions.filter((p) => p.asset !== "cash").reduce((a, p) => a + p.value, 0);
  const tax: Workspace["tax"] = lots.length ? {
    lots: lots.sort((a, b) => a.gain - b.gain),
    gains: lots.filter((l) => l.gain > 0).reduce((a, l) => a + l.gain, 0),
    losses: lots.filter((l) => l.gain < 0).reduce((a, l) => a + l.gain, 0),
    shortTerm: lots.filter((l) => l.term === "short").reduce((a, l) => a + l.gain, 0),
    longTerm: lots.filter((l) => l.term === "long").reduce((a, l) => a + l.gain, 0),
    unknownTerm: lots.filter((l) => l.term == null).reduce((a, l) => a + l.gain, 0),
    byPosition: [...byPos].map(([symbol, b]) => ({ symbol, ...b })).sort((a, b) => a.gain - b.gain),
    positionsWithLoss: [...byPos.values()].filter((b) => b.gain < 0).length,
    turningLong30: lots.filter((l) => l.daysToLong != null && l.daysToLong <= 30).length,
    lotsWithoutDate: lots.filter((l) => !l.acquired).length,
    costCoverage: riskyValue ? [...byPos.values()].reduce((a, b) => a + b.value, 0) / riskyValue : 0,
  } : null;

  // ---------------------------------------------------------------- sectors & allocation
  const sectorMap = new Map<string, number>();
  for (const p of positions) {
    if (p.style && (p.styleR2 ?? 0) >= 0.25) for (const x of p.style) sectorMap.set(x.sector, (sectorMap.get(x.sector) ?? 0) + p.weight * x.w);
    else sectorMap.set("Unclassified", (sectorMap.get("Unclassified") ?? 0) + p.weight);
  }
  const sectors = [...sectorMap].map(([sector, weight]) => ({ sector, weight })).filter((s) => s.weight >= 0.001).sort((a, b) => (a.sector === "Unclassified" ? 1 : 0) - (b.sector === "Unclassified" ? 1 : 0) || b.weight - a.weight);
  const allocMap = new Map<AssetClass, number>();
  for (const p of positions) allocMap.set(p.asset, (allocMap.get(p.asset) ?? 0) + p.weight);
  const allocation = [...allocMap].map(([asset, weight]) => ({ asset, weight })).sort((a, b) => b.weight - a.weight);

  // ---------------------------------------------------------------- benchmarks
  const benchmarks: BenchmarkStats[] = [];
  const portStats = (id: string, label: string, r: number[], weights: Record<string, number> | null): BenchmarkStats => {
    const m = new Map(W1.map((d, i) => [d, r[i]]));
    const f = fDays.length >= 120 ? regress(m) : null;
    const st = styleFor(m);
    let up: number | null = null;
    if (weights) {
      const parts = Object.entries(weights);
      const s = parts.reduce((a, [, v]) => a + v, 0) || 1;
      const known = parts.filter(([k]) => byCtx.get(k)?.trend || k === CASH_SYMBOL);
      up = known.length ? parts.reduce((a, [k, v]) => a + (byCtx.get(k)?.trend === "uptrend" ? v / s : 0), 0) : null;
    }
    return {
      id, label, r1y: r.length >= TRADING_DAYS ? levels(r).at(-1)! - 1 : null, vol: annVol(r), mdd: mddOf(r), beta: betaOf(r, spy1), sharpe: sharpeOf(r, rf1),
      corr: id === "portfolio" ? 1 : corr(r, P1), topSector: st?.mix[0] ?? null,
      factors: f ? Object.fromEntries(FACTORS.map((x, i) => [x.key, f.coef[i + 1]])) : {}, uptrend: up,
    };
  };
  if (P1.length >= 60) {
    benchmarks.push(portStats("portfolio", "This portfolio", P1, null));
    benchmarks[0].uptrend = structRows.length ? wsum((r) => r.trend === "uptrend") : null;
    // the portfolio's sector line uses the holdings-based estimate
    benchmarks[0].topSector = sectors.find((s) => s.sector !== "Unclassified") ? { sector: sectors[0].sector, w: sectors[0].weight } : null;
    for (const b of allBench) { const r = benchR.get(b.id); if (r) benchmarks.push(portStats(b.id, b.label, r, b.weights)); }
  }

  // ---------------------------------------------------------------- headline metrics
  const cashW = positions.filter((p) => p.asset === "cash" || p.asset === "cash_fund").reduce((a, p) => a + p.weight, 0);
  const pnl = positions.every((p) => p.dayPnl != null) ? positions.reduce((a, p) => a + p.dayPnl!, 0) : null;
  const metrics: Workspace["metrics"] = {
    value: total, dayPnl: pnl, dayPct: pnl != null && total - pnl > 0 ? pnl / (total - pnl) : null,
    ytd, r1y, vol: P1.length >= 60 ? annVol(P1) : null, beta: betaOf(P1, spy1), mdd: P1.length >= 60 ? mddOf(P1) : null,
    sharpe: sharpeOf(P1, rf1), incomeYield: null, holdings: positions.length, cash: cashW, historyDays: W.length,
  };

  const hhi = positions.reduce((a, p) => a + p.weight ** 2, 0);
  const ws: Workspace = {
    asOf, today: todayIso, total, positions, unknown, noPrice, unmodeled, metrics,
    perf: { dates: W1.length ? [W[W.length - W1.length - 1] ?? addDays(W1[0], -1), ...W1] : [], portfolio: levels(P1).map((v) => +(v * 100).toFixed(3)), benchmarks: perfBench },
    allocation, sectors,
    concentration: { top5: positions.slice(0, 5).reduce((a, p) => a + p.weight, 0), effective: hhi ? 1 / hhi : 0, largest: positions[0] ?? null },
    insights: [],
    risk: { rows: rows.sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0)), flagged, enb, topShare },
    correlation: { symbols: shown, matrix, clusters },
    factors: { rows: factorRows, r2: fr?.r2 ?? null, alpha: fr ? fr.coef[0] * TRADING_DAYS : null, n: fr?.n ?? 0 },
    stress,
    structure: {
      trend: { uptrend: wsum((r) => r.trend === "uptrend"), mixed: wsum((r) => r.trend === "mixed"), downtrend: wsum((r) => r.trend === "downtrend"), unknown: wsum((r) => !r.trend || r.trend === "insufficient") },
      motive: wsum((r) => r.motive === true), corrective: wsum((r) => r.motive === false), noCount: wsum((r) => r.motive == null),
      wave3: wsum((r) => r.motive === true && !r.complete && r.wave === "3"), wave5: wsum((r) => r.motive === true && !r.complete && r.wave === "5"),
      nearInvalidation: { weight: near.reduce((a, r) => a + r.weight, 0), value: near.reduce((a, r) => a + r.weight * total, 0), symbols: near.map((r) => r.symbol) },
      rows: structRows,
    },
    tax, benchmarks, drift: driftOf(positions, inp.targets),
  };
  ws.insights = insightsOf(ws);
  return ws;
}

export const CLUSTER_CORR = 0.6;
export const NEAR_INVALIDATION = 0.03;

/** Deterministic observations, each built only from figures in the workspace. */
export function insightsOf(ws: Workspace): Insight[] {
  const out: Insight[] = [];
  const n = ws.positions.length;
  if (n >= 5) out.push({ id: "top5", text: `Your five largest positions represent ${pctTxt(ws.concentration.top5)} of portfolio value.`, tone: ws.concentration.top5 >= 0.6 ? "warn" : undefined });
  else if (n) out.push({ id: "top5", text: `The portfolio holds ${n} position${n === 1 ? "" : "s"}; the largest, ${ws.concentration.largest!.symbol}, is ${pctTxt(ws.concentration.largest!.weight)} of value.`, tone: "warn" });
  const sec = ws.sectors.find((s) => s.sector !== "Unclassified");
  if (sec && sec.weight >= 0.2) out.push({ id: "sector", text: `${sec.sector} represents about ${pctTxt(sec.weight)} of estimated sector exposure.`, tone: sec.weight >= 0.35 ? "warn" : undefined });
  const ts = ws.risk.topShare;
  if (ts && ws.risk.rows.length > ts.n) out.push({ id: "risk_share", text: `${numWord(ts.n)} holding${ts.n === 1 ? "" : "s"} account${ts.n === 1 ? "s" : ""} for ${pctTxt(ts.share, 0)} of modeled portfolio volatility.` });
  for (const s of ws.risk.flagged.slice(0, 2)) {
    const r = ws.risk.rows.find((x) => x.symbol === s)!;
    out.push({ id: `flag_${s}`, text: `${s} is ${pctTxt(r.weight)} of value but ${pctTxt(r.contribution!)} of modeled risk.`, tone: "warn" });
  }
  if (ws.risk.enb != null && n >= 3) out.push({ id: "enb", text: `The portfolio behaves like about ${ws.risk.enb.toFixed(1)} independent exposures across ${n} holdings.` });
  const c = ws.correlation.clusters[0];
  if (c) out.push({ id: "cluster", text: `${listTxt(c.symbols.slice(0, 5))}${c.symbols.length > 5 ? ` and ${c.symbols.length - 5} more` : ""} move together (average correlation ${c.avgCorr.toFixed(2)}) and make up ${pctTxt(c.weight)} of value.` });
  const t = ws.structure.trend;
  if (ws.structure.rows.length) out.push({ id: "trend", text: `${pctTxt(t.uptrend, 0)} of value is in securities Viridia classifies as uptrends and ${pctTxt(t.downtrend, 0)} in downtrends.`, tone: t.downtrend > t.uptrend ? "neg" : undefined });
  const ni = ws.structure.nearInvalidation;
  if (ni.symbols.length) out.push({ id: "near_inv", text: `${pctTxt(ni.weight)} of value (${listTxt(ni.symbols)}) is within 3% of a Viridia structural invalidation level.`, tone: "warn" });
  if (ws.metrics.beta != null) out.push({ id: "beta", text: `Beta to the S&P 500 is ${ws.metrics.beta.toFixed(2)} over the past year of sessions.` });
  if (ws.tax?.positionsWithLoss) out.push({ id: "tax_loss", text: `${numWord(ws.tax.positionsWithLoss)} position${ws.tax.positionsWithLoss === 1 ? "" : "s"} currently contain${ws.tax.positionsWithLoss === 1 ? "s" : ""} unrealized losses.` });
  if (ws.tax?.turningLong30) out.push({ id: "tax_lt", text: `${numWord(ws.tax.turningLong30)} tax lot${ws.tax.turningLong30 === 1 ? "" : "s"} transition${ws.tax.turningLong30 === 1 ? "s" : ""} from short-term to long-term status within 30 days.` });
  return out;
}

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
export const numWord = (n: number) => WORDS[n] ?? String(n);
export const listTxt = (x: string[]) => (x.length <= 1 ? x.join("") : `${x.slice(0, -1).join(", ")} and ${x.at(-1)}`);
export const patternName = (p: string | null) => (p ? PATTERN_LABEL[p as CandidatePattern] ?? p : null);
