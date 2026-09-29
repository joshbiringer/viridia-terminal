/**
 * Viridia Intelligence: context across a fixed set of dimensions instead of a single buy/sell rating.
 * The same taxonomy is used on the security page, the scanner, the watchlist and the portfolio:
 * Structure, Wave, Fibonacci, Momentum, Regime, Risk (Fundamentals, Valuation and Earnings join when
 * their data is live). Each state is computed from stored data with the stated rule; dimensions
 * without data say so.
 */
import type { Glance } from "@engine/glance";
import type { ConfluenceZone } from "@engine/fib";
import { SWING_LABEL, type SwingStructure } from "./pivots";
import { beta, dailyReturns, maxDrawdown, periodReturn, volatility, type Close } from "./stats";
import { fundamentalDims, type Fundamentals, type SectorMedian } from "@/lib/fundamentals/model";

export type IntelKey = "structure" | "wave" | "fibonacci" | "momentum" | "regime" | "risk";
/** The Viridia Intelligence dimensions, in display order. */
export const INTEL_DIMENSIONS: { key: IntelKey; label: string }[] = [
  { key: "structure", label: "Structure" }, { key: "wave", label: "Wave" }, { key: "fibonacci", label: "Fibonacci" },
  { key: "momentum", label: "Momentum" }, { key: "regime", label: "Regime" }, { key: "risk", label: "Risk" },
];

export type Tone = "pos" | "neg" | "neutral" | "warn" | "na";

export interface SignalDim {
  key: IntelKey | "fundamentals" | "valuation";
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
  /** Intermediate-degree swing structure from the engine's pivots. */
  swing?: SwingStructure | null;
  /** Fibonacci confluence zones around the latest close. */
  zones?: ConfluenceZone[] | null;
  /** SEC fundamentals and the sector's medians; undefined when not loaded. */
  fundamentals?: Fundamentals | null;
  sector?: SectorMedian | null;
}

const pc = (x: number, d = 1) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toFixed(d)}%`;

export const SIGNALS_METHOD =
  "Structure: the intermediate-degree swing structure (higher highs and lows, lower highs and lows, expanding or contracting). Wave: the preferred daily wave count's expected direction (constructive up, defensive down), unresolved when the alternate is within 5 points. Fibonacci: the nearest confluence zone of Fibonacci relationships and the distance to it (inside, or within 3%, counts as at a zone). Regime: price against its 50- and 200-day averages. Momentum: 3-month return and its lead over SPY (strong when both are positive and the lead is over 5 points; weak when both are negative). Risk: 20-day volatility against the 1-year level (elevated above 1.25×), and the 1-year drawdown and beta to SPY.";

export function computeSignals(i: SignalsInput): SignalDim[] {
  const close = i.bars.at(-1)?.close ?? null;
  const out: SignalDim[] = [];

  // ---------------------------------------------------------------- structure
  const sw = i.swing ?? null;
  if (sw && sw !== "insufficient") {
    out.push({
      key: "structure", label: "Structure", state: SWING_LABEL[sw][0].toUpperCase() + SWING_LABEL[sw].slice(1),
      tone: sw === "higher_highs_lows" ? "pos" : sw === "lower_highs_lows" ? "neg" : "neutral",
      detail: "Intermediate-degree swings on the daily chart.", rule: "Intermediate swing structure",
    });
  } else {
    out.push({ key: "structure", label: "Structure", state: "Not enough swings", tone: "na", detail: "Needs more confirmed intermediate swings.", rule: "Intermediate swing structure" });
  }

  // ---------------------------------------------------------------- wave
  const g = i.glance?.preferred ?? null;
  if (g && i.glance) {
    const up = g.waveDirection === "up";
    const where = g.complete ? `${g.pattern.replace("_", " ")} complete, next move ${g.waveDirection}` : `${g.pattern.replace("_", " ")}, wave ${g.wave} ${g.waveDirection}`;
    const wk = i.weekly ? (i.weekly.preferred.waveDirection === g.waveDirection ? "; the weekly count agrees" : "; the weekly count points the other way") : "";
    out.push({
      key: "wave", label: "Wave",
      state: i.glance.closeCall ? "Unresolved" : up ? "Constructive" : "Defensive",
      tone: i.glance.closeCall ? "warn" : up ? "pos" : "neg",
      detail: `${where[0].toUpperCase()}${where.slice(1)} (Pattern Confidence ${g.score})${wk}.`,
      rule: "Preferred daily wave count",
    });
  } else {
    out.push({ key: "wave", label: "Wave", state: "No count", tone: "na", detail: "No rule-valid wave count yet.", rule: "Preferred daily wave count" });
  }

  // ---------------------------------------------------------------- fibonacci
  const zones = close != null ? i.zones ?? [] : [];
  const near = [...zones].sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))[0];
  if (near && close != null) {
    const inside = close >= near.low && close <= near.high;
    const at = inside || Math.abs(near.distancePct) <= 0.03;
    out.push({
      key: "fibonacci", label: "Fibonacci",
      state: inside ? "Inside a zone" : at ? "At a zone" : `Zone ${near.side}`,
      tone: at ? "warn" : "neutral",
      detail: `Nearest confluence ${near.low.toLocaleString("en-US", { maximumFractionDigits: 2 })}–${near.high.toLocaleString("en-US", { maximumFractionDigits: 2 })} (${near.count} relationships), ${inside ? "price inside it" : `${pc(near.mid / close - 1)} from the close`}.`,
      rule: "Nearest Fibonacci confluence zone",
    });
  } else {
    out.push({ key: "fibonacci", label: "Fibonacci", state: "No zone", tone: "na", detail: "No confluence zone near price.", rule: "Nearest Fibonacci confluence zone" });
  }

  // ---------------------------------------------------------------- regime (the security's own trend state)
  if (close && i.sma50 && i.sma200 && i.trend && i.trend !== "insufficient") {
    out.push({
      key: "regime", label: "Regime",
      state: i.trend === "uptrend" ? "Uptrend" : i.trend === "downtrend" ? "Downtrend" : "Mixed",
      tone: i.trend === "uptrend" ? "pos" : i.trend === "downtrend" ? "neg" : "neutral",
      detail: `${pc(close / i.sma50 - 1)} vs the 50-day average, ${pc(close / i.sma200 - 1)} vs the 200-day.`,
      rule: "Price vs 50- and 200-day averages",
    });
  } else {
    out.push({ key: "regime", label: "Regime", state: "Not enough history", tone: "na", detail: "Needs 200 sessions.", rule: "Price vs 50- and 200-day averages" });
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

  // Fundamentals and Valuation join only when their data is live; nothing is shown for them otherwise
  if (i.fundamentals) out.push(...fundamentalDims(i.fundamentals, i.sector));
  // Momentum sits after Fibonacci, Regime after Momentum
  const order = ["structure", "wave", "fibonacci", "momentum", "regime", "risk", "fundamentals", "valuation"];
  return out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}
