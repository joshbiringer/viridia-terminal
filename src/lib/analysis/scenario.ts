/**
 * Scenario vocabulary. Setups are research scenarios from Viridia's structural model, so the product
 * describes them as bullish or bearish with a reference level, an invalidation and a structural
 * target, never as orders to buy or sell.
 */
export const SIDE_LABEL = { buy: "Bullish", sell: "Bearish" } as const;
export const SIDE_SCENARIO = { buy: "Bullish setup", sell: "Bearish setup" } as const;
export const LEVEL_LABEL = { entry: "Reference level", stop: "Invalidation", target: "Structural target" } as const;
export const SCENARIO_NOTE = "Research scenario generated from Viridia's structural model. Not a recommendation.";
export const SCENARIO_HORIZON = "Followed for up to 60 sessions in the track record.";
export const sideLabel = (s: string | null | undefined) => (s === "buy" ? SIDE_LABEL.buy : s === "sell" ? SIDE_LABEL.sell : "—");

/** Plain descriptions of setup_flags codes (migration 0033). */
export const FLAG_LABEL: Record<string, string> = {
  no_price: "no current price", missing_levels: "levels missing", entry_far: "reference level over 30% from price",
  wrong_side: "levels on the wrong side", risk_wide: "invalidation over 25% away", atr_wide: "invalidation over 8 ATR away",
  atr_tight: "invalidation inside daily noise", target_far: "target over 100% or 25 ATR away", rr_mismatch: "reward/risk doesn't reconcile",
  rr_extreme: "reward/risk outside 1–10", stale_analysis: "analysis older than the latest bars", split_suspect: "recent split-like jump in the history",
  no_degree: "no degree recorded", no_setup: "no setup",
};

export interface LevelSet { entry: { low: number; high: number }; stop: { price: number }; target: { price: number }; rr: number; degree?: string }

/**
 * The same sanity checks as the database's setup_flags (migration 0033), for setups checked in the
 * browser (for example at a degree other than the headline one). Returns the failed checks.
 */
export function setupFlags(s: LevelSet | null, side: "buy" | "sell", close: number | null, atr: number | null, analysisTs?: string | null, lastTs?: string | null, split = false): string[] {
  if (!s) return ["no_setup"];
  const f: string[] = [];
  if (close == null || !(close > 0)) f.push("no_price");
  const { low: lo, high: hi } = s.entry; const stop = s.stop.price, tgt = s.target.price;
  if ([lo, hi, stop, tgt].some((v) => v == null || !isFinite(v))) return [...f, "missing_levels"];
  const mid = (lo + hi) / 2;
  if (close && close > 0 && Math.abs(mid / close - 1) > 0.3) f.push("entry_far");
  if ((side === "buy" && !(stop < lo && tgt > hi)) || (side === "sell" && !(stop > hi && tgt < lo))) f.push("wrong_side");
  const risk = Math.abs(mid - stop), reward = Math.abs(tgt - mid);
  if (mid > 0 && risk / mid > 0.25) f.push("risk_wide");
  if (atr && atr > 0 && risk > 8 * atr) f.push("atr_wide");
  if (atr && atr > 0 && risk < 0.3 * atr) f.push("atr_tight");
  if ((mid > 0 && reward / mid > 1) || (atr && atr > 0 && reward > 25 * atr)) f.push("target_far");
  if (risk > 0) {
    const rr = reward / risk;
    if (s.rr > 0 && Math.abs(rr / s.rr - 1) > 0.15) f.push("rr_mismatch");
    if (rr > 10 || rr < 1) f.push("rr_extreme");
  }
  if (analysisTs && lastTs && Date.parse(lastTs) - Date.parse(analysisTs) > 5 * 864e5) f.push("stale_analysis");
  if (split) f.push("split_suspect");
  if (!s.degree) f.push("no_degree");
  return f;
}
