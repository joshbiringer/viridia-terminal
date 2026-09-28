/**
 * Viridia engine: setup track record (backtest).
 *
 * Replays the engine through a security's history and records what each setup would have done:
 *   1. At every `step`-th bar t after a warm-up, run the full engine on bars[0..t] only. Nothing after
 *      t is visible to it, so the setup is exactly what Viridia would have shown that day.
 *   2. Take the setup at the glance degree (the one the Setups screen shows).
 *   3. Walk forward from t+1 for up to `horizon` bars:
 *        waiting setups must fill first (price trades into the entry range); if the target is hit
 *        before a fill, the outcome is "missed"
 *        then the first of stop or target decides the outcome. When one bar touches both, the stop
 *        is counted (conservative, since daily bars don't say which came first)
 *        if neither is hit within the horizon the outcome is "expired", marked to the last close
 *        if the data ends before the horizon, the outcome is "pending" and stats leave it out
 *   4. A setup already being tracked (same count, same kind) is not counted again on later steps.
 *
 * Results are in R: +rr at the target, −1 at the stop, and (close − entry) ÷ risk when it expires.
 * Fills are at the close (active) or at the edge of the entry range (waiting); no costs or slippage.
 * Limits: only securities listed today are replayed (survivorship), and bars are split-adjusted.
 */
import type { PivotBar, Timeframe } from "./pivots.ts";
import { computeAnalysis } from "./analyze.ts";
import type { Setup } from "./setup.ts";

export const BACKTEST_VERSION = "backtest-1.0.0";

export type Outcome = "target" | "stop" | "expired" | "missed" | "pending";

export interface Trial {
  ts: string;
  degree: Setup["degree"];
  kind: Setup["kind"];
  side: Setup["side"];
  status: Setup["status"];
  score: number;
  rr: number;
  entry: number;
  stop: number;
  target: number;
  outcome: Outcome;
  /** Result in multiples of the initial risk; null for missed and pending. */
  r: number | null;
  /** Bars from the signal to the outcome. */
  bars: number;
}

export interface BacktestOptions { warmup?: number; step?: number; horizon?: number }
export const DEFAULT_BACKTEST: Required<BacktestOptions> = { warmup: 250, step: 5, horizon: 60 };

/** What the setup did after bar t (exported for tests). */
export interface Levels { side: Setup["side"]; status: Setup["status"]; entry: { low: number; high: number }; stop: { price: number }; target: { price: number } }

export function resolve(s: Levels, bars: PivotBar[], t: number, horizon: number): { outcome: Outcome; r: number | null; bars: number; fill: number } {
  const buy = s.side === "buy";
  const last = Math.min(bars.length - 1, t + horizon);
  let fill = s.status === "active" ? bars[t].close : NaN;
  const risk = () => Math.abs(fill - s.stop.price);
  for (let i = t + 1; i <= last; i++) {
    const b = bars[i];
    if (Number.isNaN(fill)) {
      // waiting: the target before the entry means the move happened without us
      const hitTarget = buy ? b.high >= s.target.price : b.low <= s.target.price;
      const filled = buy ? b.low <= s.entry.high : b.high >= s.entry.low;
      if (!filled) {
        if (hitTarget) return { outcome: "missed", r: null, bars: i - t, fill: NaN };
        continue;
      }
      fill = buy ? Math.min(s.entry.high, b.open) : Math.max(s.entry.low, b.open);
    }
    const hitStop = buy ? b.low <= s.stop.price : b.high >= s.stop.price;
    const hitTarget = buy ? b.high >= s.target.price : b.low <= s.target.price;
    if (hitStop) return { outcome: "stop", r: -1, bars: i - t, fill };
    if (hitTarget) return { outcome: "target", r: Math.abs(s.target.price - fill) / risk(), bars: i - t, fill };
  }
  if (t + horizon > bars.length - 1) return { outcome: "pending", r: null, bars: last - t, fill };
  if (Number.isNaN(fill)) return { outcome: "missed", r: null, bars: horizon, fill };
  const mark = bars[last].close;
  return { outcome: "expired", r: ((buy ? 1 : -1) * (mark - fill)) / risk(), bars: horizon, fill };
}

export function backtest(bars: PivotBar[], timeframe: Timeframe, options: BacktestOptions = {}): Trial[] {
  const o = { ...DEFAULT_BACKTEST, ...options };
  const out: Trial[] = [];
  const open = new Map<string, number>(); // countId|kind → bar index its outcome resolves
  for (let t = o.warmup; t < bars.length - 1; t += o.step) {
    const s = computeAnalysis(bars.slice(0, t + 1), timeframe).setup;
    if (!s) continue;
    const key = `${s.countId}|${s.kind}`;
    if ((open.get(key) ?? -1) >= t) continue;
    const res = resolve(s, bars, t, o.horizon);
    open.set(key, t + res.bars);
    out.push({
      ts: bars[t].ts, degree: s.degree, kind: s.kind, side: s.side, status: s.status, score: s.score, rr: s.rr,
      entry: s.status === "active" ? s.entry.low : res.fill || (s.entry.low + s.entry.high) / 2,
      stop: s.stop.price, target: s.target.price,
      outcome: res.outcome, r: res.r == null ? null : Math.round(res.r * 100) / 100, bars: res.bars,
    });
  }
  return out;
}

export interface TrackRecord {
  trials: number;
  resolved: number;
  targets: number;
  stops: number;
  expired: number;
  /** Share of resolved trials that reached the target first (targets ÷ (targets + stops + expired)). */
  hitRate: number | null;
  /** Average result in R over resolved trials. */
  avgR: number | null;
}

export function summarize(trials: Pick<Trial, "outcome" | "r">[]): TrackRecord {
  const done = trials.filter((x) => x.outcome === "target" || x.outcome === "stop" || x.outcome === "expired");
  const targets = done.filter((x) => x.outcome === "target").length;
  return {
    trials: trials.length, resolved: done.length, targets,
    stops: done.filter((x) => x.outcome === "stop").length,
    expired: done.filter((x) => x.outcome === "expired").length,
    hitRate: done.length ? targets / done.length : null,
    avgR: done.length ? Math.round((done.reduce((a, x) => a + (x.r ?? 0), 0) / done.length) * 100) / 100 : null,
  };
}
