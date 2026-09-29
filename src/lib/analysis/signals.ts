/**
 * Viridia Signals: context across several dimensions instead of a single buy/sell rating. Each state
 * is computed from stored data with the stated rule; dimensions without data say so.
 */
import type { Glance } from "@engine/glance";
import { beta, dailyReturns, maxDrawdown, periodReturn, volatility, type Close } from "./stats";
import { fundamentalDims, type Fundamentals, type SectorMedian } from "@/lib/fundamentals/model";

export type Tone = "pos" | "neg" | "neutral" | "warn" | "na";

export interface SignalDim {
  key: "structure" | "trend" | "momentum" | "risk" | "fundamentals" | "valuation";
  label: string;
  state: string;
  tone: Tone;
  detail: string;
  rule: string;
}

export interface SignalsInput {
  bars: Close[];
  benchmark: Close[];
  trend: "uptrend" | "downtrend" | "mixed" | "insufficient" | null;
  sma50: number | null;
  sma200: number | null;
  glance: Glance | null;
  weekly: Glance | null;
  /** SEC fundamentals and the sector's medians; undefined when not loaded. */
  fundamentals?: Fundamentals | null;
  sector?: SectorMedian | null;
}

const pc = (x: number, d = 1) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toFixed(d)}%`;

export const SIGNALS_METHOD =
  "Structure: the preferred daily wave count's expected direction (constructive up, defensive down), unresolved when the alternate is within 5 points. Trend: price against its 50- and 200-day averages. Momentum: 3-month return and its lead over SPY (strong when both are positive and the lead is over 5 points; weak when both are negative). Risk: 20-day volatility against the 1-year level (elevated above 1.25×), and the 1-year drawdown and beta to SPY. Fundamentals: revenue growth (5% either way) and profitability from SEC filings. Valuation: P/E (or P/S when earnings are negative) against the sector median, 1.5× apart counting as above or below. Fundamentals come from SEC EDGAR XBRL filings.";

export function computeSignals(i: SignalsInput): SignalDim[] {
  const close = i.bars.at(-1)?.close ?? null;
  const out: SignalDim[] = [];

  // ---------------------------------------------------------------- structure
  const g = i.glance?.preferred ?? null;
  if (g && i.glance) {
    const up = g.waveDirection === "up";
    const where = g.complete ? `${g.pattern.replace("_", " ")} complete, next move ${g.waveDirection}` : `${g.pattern.replace("_", " ")}, wave ${g.wave} ${g.waveDirection}`;
    const wk = i.weekly ? (i.weekly.preferred.waveDirection === g.waveDirection ? "; the weekly count agrees" : "; the weekly count points the other way") : "";
    out.push({
      key: "structure", label: "Structure",
      state: i.glance.closeCall ? "Unresolved" : up ? "Constructive" : "Defensive",
      tone: i.glance.closeCall ? "warn" : up ? "pos" : "neg",
      detail: `${where[0].toUpperCase()}${where.slice(1)} (Pattern Confidence ${g.score})${wk}.`,
      rule: "Preferred daily wave count",
    });
  } else {
    out.push({ key: "structure", label: "Structure", state: "No count", tone: "na", detail: "No rule-valid wave count yet.", rule: "Preferred daily wave count" });
  }

  // ---------------------------------------------------------------- trend
  if (close && i.sma50 && i.sma200 && i.trend && i.trend !== "insufficient") {
    out.push({
      key: "trend", label: "Trend",
      state: i.trend === "uptrend" ? "Uptrend" : i.trend === "downtrend" ? "Downtrend" : "Mixed",
      tone: i.trend === "uptrend" ? "pos" : i.trend === "downtrend" ? "neg" : "neutral",
      detail: `${pc(close / i.sma50 - 1)} vs the 50-day average, ${pc(close / i.sma200 - 1)} vs the 200-day.`,
      rule: "Price vs 50- and 200-day averages",
    });
  } else {
    out.push({ key: "trend", label: "Trend", state: "Not enough history", tone: "na", detail: "Needs 200 sessions.", rule: "Price vs 50- and 200-day averages" });
  }

  // ---------------------------------------------------------------- momentum
  const r63 = periodReturn(i.bars, 63), b63 = periodReturn(i.benchmark, 63), r126 = periodReturn(i.bars, 126);
  if (r63 != null && b63 != null) {
    const lead = r63 - b63;
    const state = r63 > 0 && lead > 0.05 ? "Strong" : r63 > 0 ? "Positive" : r63 < 0 && lead < 0 ? "Weak" : "Soft";
    out.push({
      key: "momentum", label: "Momentum", state,
      tone: state === "Strong" || state === "Positive" ? "pos" : state === "Weak" ? "neg" : "neutral",
      detail: `3 months ${pc(r63)} (${lead >= 0 ? "ahead of" : "behind"} SPY by ${Math.abs(lead * 100).toFixed(1)} points)${r126 != null ? `; 6 months ${pc(r126)}` : ""}.`,
      rule: "3-month return and lead over SPY",
    });
  } else {
    out.push({ key: "momentum", label: "Momentum", state: "Not enough history", tone: "na", detail: "Needs 3 months of sessions.", rule: "3-month return and lead over SPY" });
  }

  // ---------------------------------------------------------------- risk
  const v20 = volatility(i.bars, 20), v252 = volatility(i.bars, 252), dd = maxDrawdown(i.bars, 252);
  const b = beta(dailyReturns(i.bars), dailyReturns(i.benchmark));
  if (v20 != null && v252 != null) {
    const hot = v20 > 1.25 * v252;
    const hold = g?.hold ?? g?.reassess ?? null;
    const nearLevel = hold != null && close != null && Math.abs(hold / close - 1) <= 0.03;
    const parts = [`20-day volatility ${(v20 * 100).toFixed(0)}% vs ${(v252 * 100).toFixed(0)}% over the year`];
    if (dd != null) parts.push(`1-year drawdown ${pc(dd)}`);
    if (b != null) parts.push(`beta ${b.toFixed(2)}`);
    if (nearLevel) parts.push(`price within 3% of the count's ${g?.hold != null ? "invalidation" : "reassess"} level`);
    out.push({
      key: "risk", label: "Risk",
      state: hot ? "Elevated" : nearLevel ? "Near a key level" : "Normal",
      tone: hot || nearLevel ? "warn" : "neutral",
      detail: `${parts.join("; ")}.`,
      rule: "Volatility regime, drawdown, beta",
    });
  } else {
    out.push({ key: "risk", label: "Risk", state: "Not enough history", tone: "na", detail: "Needs a month of sessions.", rule: "Volatility regime, drawdown, beta" });
  }

  if (i.fundamentals === undefined) {
    out.push({ key: "fundamentals", label: "Fundamentals", state: "Not available", tone: "na", detail: "Fundamentals couldn't be loaded.", rule: "Revenue growth and margins from SEC filings" });
    out.push({ key: "valuation", label: "Valuation", state: "Not available", tone: "na", detail: "Fundamentals couldn't be loaded.", rule: "P/E or P/S against the sector median" });
  } else {
    out.push(...fundamentalDims(i.fundamentals, i.sector));
  }
  return out;
}
