/**
 * Viridia engine: wave setups (buy and sell signals).
 *
 * A setup is what the preferred count implies for a trade, stated in the three numbers a trader needs:
 * where to enter, where the count is wrong (the stop), and where the count's own Fibonacci relationship
 * points (the target). Every number comes from the count and the rulebook; nothing is estimated from
 * anything else. When a count does not define a stop and a target on the right sides of the entry, it
 * produces no setup rather than a guess.
 *
 * Sources (see viridia-wave-knowledge.md):
 *   - Basics: rule levels are objective risk points ("a wave 2 retracing past the start of wave 1").
 *   - Basics: wave 2 most often retraces 61.8% of wave 1, then 50% or 38.2%.
 *   - EWF: wave 3 ≥ 161.8% of wave 1; wave 4 retraces 23.6–38.2% of wave 3; zigzag B retraces 50–61.8%.
 *   - Essentials: wave 5 = wave 1 when wave 3 extends; C = A in a zigzag; corrections tend to end near
 *     the prior fourth wave.
 *   - Article: wave 5 is almost never as dynamic as wave 3; reduce risk late in a fifth wave.
 *
 * Kinds
 *   wave3, wave5, waveC          the preferred count is in a trending wave now: enter at the close
 *   pullback2, pullback4, pullbackB
 *                                 the preferred count is in a correction: wait for it to end in the
 *                                 entry zone, then trade the wave that follows
 *   after_correction, after_impulse
 *                                 the preferred count is finished: trade the move that follows
 *
 * Reward:risk uses the middle of the entry range. It describes the count's geometry, not a forecast.
 * A setup needs reward:risk of at least MIN_RR; below it the count has already covered most of the
 * distance to its target, and the stop is further away than the target.
 *
 * Pullback entries (waves 2 and 4) are for impulses only: the sources give no entry level or
 * wave-5 projection for diagonal corrections, and a contracting diagonal's wave 5 must be shorter
 * than wave 3, which the "wave 5 = wave 1" projection would ignore.
 */
import type { CompactCandidate, CompactCandidateSet } from "./candidates.ts";
import type { ConfluenceZone } from "./fib.ts";
import type { Degree } from "./pivots.ts";
import { alternateIndex, band, CLOSE_CALL, type ConfidenceBand } from "./rank.ts";
import { compactScenario } from "./glance.ts";

export const SETUP_VERSION = "setup-1.0.1";

/** A trade whose target is closer than its stop is not a setup: most of the expected move has happened. */
export const MIN_RR = 1;

export type SetupKind =
  | "wave3" | "wave5" | "waveC"
  | "pullback2" | "pullback4" | "pullbackB"
  | "after_correction" | "after_impulse";

export const SETUP_LABEL: Record<SetupKind, string> = {
  wave3: "Wave 3 under way",
  wave5: "Wave 5 under way",
  waveC: "Wave C under way",
  pullback2: "Wave 2 pullback",
  pullback4: "Wave 4 pullback",
  pullbackB: "Wave B bounce",
  after_correction: "Correction complete",
  after_impulse: "Five waves complete",
};

export interface Setup {
  version: string;
  degree: Degree;
  kind: SetupKind;
  side: "buy" | "sell";
  /** active: the traded wave is under way now. waiting: the correction before it has not ended yet. */
  status: "active" | "waiting";
  countId: string;
  score: number;
  band: ConfidenceBand;
  /** Preferred and alternate within CLOSE_CALL points. */
  closeCall: boolean;
  entry: { low: number; high: number; basis: string; zoneCount: number | null };
  stop: { price: number; basis: string; rule: boolean };
  target: { price: number; basis: string };
  /** Reward ÷ risk from the middle of the entry range. */
  rr: number;
  /** Distance from entry to stop, as a fraction of the entry price. */
  riskPct: number;
  cautions: string[];
}

const MOTIVE = new Set(["impulse", "leading_diagonal", "ending_diagonal"]);
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const pctL = (r: number) => `${(r * 100).toFixed(r * 100 % 1 ? 1 : 0)}%`;

/** A zone that contains the price, for a waiting entry. */
function zoneAt(price: number, zones: ConfluenceZone[]): ConfluenceZone | null {
  return zones.find((z) => price >= z.low && price <= z.high) ?? null;
}

/** First stored target beyond `from` in the trade direction, primary relationships first. */
function targetBeyond(c: CompactCandidate, from: number, up: boolean): { price: number; basis: string } | null {
  const beyond = (c.tg ?? []).filter(([p]) => (up ? p > from : p < from));
  const pick = beyond.find((t) => t[2]) ?? beyond[0];
  return pick ? { price: pick[0], basis: pick[1] } : null;
}

interface Draft {
  kind: SetupKind; side: "buy" | "sell"; status: "active" | "waiting";
  entry: Setup["entry"]; stop: Setup["stop"]; target: Setup["target"] | null; cautions: string[];
}

/** The setup the preferred count implies, or null when it does not define one. */
export function draftSetup(c: CompactCandidate, close: number, zones: ConfluenceZone[]): Draft | string {
  const P = c.p.map((x) => x[1]);
  const k = P.length - 1; // completed waves
  const L = (i: number) => Math.abs(P[i] - P[i - 1]);
  const motive = MOTIVE.has(c.pt);
  const trendUp = c.d === "u";
  const nextUp = c.nx.d === "u";
  const now = (basis: string) => ({ low: close, high: close, basis, zoneCount: null });
  const hold = c.nx.h != null ? { price: c.nx.h, basis: c.nx.hr ?? "Rule level for the wave in progress", rule: true } : null;

  // ---------------------------------------------------------------- trending wave under way: enter now
  if (!c.c && ((motive && (c.nx.l === "3" || c.nx.l === "5")) || ((c.pt === "zigzag" || c.pt === "flat") && c.nx.l === "C"))) {
    if (!hold) return "The rules set no stop for the wave in progress, so there is no defined risk.";
    const kind: SetupKind = c.nx.l === "3" ? "wave3" : c.nx.l === "5" ? "wave5" : "waveC";
    const cautions: string[] = [];
    if (kind === "wave5") cautions.push("Late in the trend: wave 5 usually comes on lighter volume than wave 3, and the sources advise reducing risk here rather than chasing.");
    if (kind === "waveC") cautions.push("Counter-trend trade: wave C ends the correction, after which the larger trend resumes.");
    return {
      kind, side: nextUp ? "buy" : "sell", status: "active", entry: now("Latest close"), stop: hold,
      target: targetBeyond(c, close, nextUp), cautions,
    };
  }

  // ---------------------------------------------------------------- correction under way: wait for it
  if (!c.c && c.pt === "impulse" && (c.nx.l === "2" || c.nx.l === "4") && hold) {
    const w2 = c.nx.l === "2";
    // entry where the correction most often ends
    const ratio = w2 ? 0.618 : 0.382;
    const corrected = w2 ? L(1) : L(3);
    const start = w2 ? P[1] : P[3];
    const entryPrice = start + (trendUp ? -1 : 1) * ratio * corrected;
    const z = zoneAt(entryPrice, zones);
    const entry = z
      ? { low: z.low, high: z.high, basis: `Wave ${c.nx.l} retraces ${pctL(ratio)} of wave ${w2 ? 1 : 3}, inside a confluence zone`, zoneCount: z.count }
      : { low: entryPrice, high: entryPrice, basis: `Wave ${c.nx.l} retraces ${pctL(ratio)} of wave ${w2 ? 1 : 3}`, zoneCount: null };
    const mid = (entry.low + entry.high) / 2;
    const target = w2
      ? { price: mid + (trendUp ? 1 : -1) * 1.618 * L(1), basis: "Wave 3 = 161.8% of wave 1, measured from the entry" }
      : { price: mid + (trendUp ? 1 : -1) * L(1), basis: "Wave 5 = wave 1, measured from the entry" };
    const cautions = [`Waiting: enter only if wave ${c.nx.l} reaches the entry range without crossing the stop.`];
    if (!w2) cautions.push("The trade is wave 5: late in the trend, usually on lighter volume than wave 3.");
    return { kind: w2 ? "pullback2" : "pullback4", side: trendUp ? "buy" : "sell", status: "waiting", entry, stop: hold, target, cautions };
  }

  if (!c.c && c.pt === "zigzag" && c.nx.l === "B" && hold) {
    const entryPrice = P[1] + (trendUp ? 1 : -1) * 0.618 * L(1);
    const z = zoneAt(entryPrice, zones);
    const entry = z
      ? { low: z.low, high: z.high, basis: "Wave B retraces 61.8% of wave A, inside a confluence zone", zoneCount: z.count }
      : { low: entryPrice, high: entryPrice, basis: "Wave B retraces 61.8% of wave A", zoneCount: null };
    const mid = (entry.low + entry.high) / 2;
    return {
      kind: "pullbackB", side: trendUp ? "buy" : "sell", status: "waiting", entry, stop: hold,
      target: { price: mid + (trendUp ? 1 : -1) * L(1), basis: "Wave C = wave A, measured from the entry" },
      cautions: ["Waiting: enter only if wave B reaches the entry range without crossing the stop.", "Counter-trend trade: wave C ends the correction."],
    };
  }

  // ---------------------------------------------------------------- finished pattern: trade what follows
  if (c.c && (c.pt === "zigzag" || c.pt === "flat" || c.pt === "triangle")) {
    const end = P[k];
    const stop = { price: end, basis: `End of wave ${c.pt === "triangle" ? "E" : "C"}: beyond it the correction is still extending`, rule: false };
    return {
      kind: "after_correction", side: nextUp ? "buy" : "sell", status: "active", entry: now("Latest close"), stop,
      target: targetBeyond(c, close, nextUp) ?? ((nextUp ? P[0] > close : P[0] < close) ? { price: P[0], basis: "Start of the correction: the resuming trend should pass it" } : null),
      cautions: [],
    };
  }
  if (c.c && motive) {
    const stop = { price: P[k], basis: "End of wave 5: beyond it wave 5 is still extending", rule: false };
    return {
      kind: "after_impulse", side: nextUp ? "buy" : "sell", status: "active", entry: now("Latest close"), stop,
      target: (nextUp ? P[4] > close : P[4] < close) ? { price: P[4], basis: "End of wave 4: corrections tend to end near it" } : targetBeyond(c, close, nextUp),
      cautions: ["Counter-trend trade against the five-wave move just finished."],
    };
  }
  if (!c.c && c.pt === "triangle") return "A triangle moves sideways; the setup comes with the thrust once the triangle completes.";
  if (!c.c && motive && (c.nx.l === "2" || c.nx.l === "4")) return `Wave ${c.nx.l} of a diagonal is in progress; the sources give no entry level for diagonal corrections.`;
  if (!c.c && c.pt === "flat" && c.nx.l === "B") return "Wave B of a flat can end at or beyond the start of wave A, so it has no reliable entry level.";
  if (!c.c && c.nx.l === "C" && !hold) return "The rules set no stop for wave C of a flat, so there is no defined risk.";
  return "The preferred count doesn't map to a trade in its current state.";
}

export interface SetupVerdict { setup: Setup | null; reason: string | null }

/** Setup for one degree: the preferred count's, checked for geometry and freshness. */
export function setupOf(set: CompactCandidateSet | null | undefined, degree: Degree, close: number | null, zones: ConfluenceZone[]): Setup | null {
  return setupVerdict(set, degree, close, zones).setup;
}

/** The setup, or the plain-language reason there is none. */
export function setupVerdict(set: CompactCandidateSet | null | undefined, degree: Degree, close: number | null, zones: ConfluenceZone[]): SetupVerdict {
  const no = (reason: string): SetupVerdict => ({ setup: null, reason });
  const cands = set?.c ?? [];
  if (!cands.length) return no("There is no rule-valid count at this degree.");
  if (close == null || !(close > 0)) return no("There is no closing price to measure from.");
  const c = cands[0];
  const d = draftSetup(c, close, zones);
  if (typeof d === "string") return no(d);
  if (!d.target) return no("The count has no unreached Fibonacci target beyond the current price.");
  const buy = d.side === "buy";
  const mid = (d.entry.low + d.entry.high) / 2;
  // stop and target must lie on the right sides of the entry
  if (buy ? !(d.stop.price < d.entry.low && d.target.price > d.entry.high) : !(d.stop.price > d.entry.high && d.target.price < d.entry.low))
    return no("The count's stop or target lies on the wrong side of the entry.");
  // an active setup is stale once price has crossed its stop or reached its target
  if (d.status === "active" && (buy ? close >= d.target.price : close <= d.target.price)) return no("Price has already reached the count's target.");
  if (d.status === "active" && (buy ? close <= d.stop.price : close >= d.stop.price)) return no("Price is already beyond the stop.");
  // a waiting setup needs price still on the far side of the entry (the pullback has not happened yet)
  if (d.status === "waiting" && (buy ? close < d.entry.low : close > d.entry.high)) return no("Price is already through the entry range, so the pullback entry has passed.");
  const risk = Math.abs(mid - d.stop.price), reward = Math.abs(d.target.price - mid);
  if (!(risk > 0)) return no("The entry sits on the stop, so the risk can't be measured.");
  const rr = Math.round((reward / risk) * 100) / 100;
  if (rr < MIN_RR) {
    return no(`The target is closer than the stop (reward:risk ${rr.toFixed(2)} : 1): most of the count's expected move has already happened, so it isn't a setup.`);
  }
  const score = c.sc ?? 50;
  const ai = alternateIndex(cands, compactScenario);
  const closeCall = ai > 0 && score - (cands[ai].sc ?? 50) < CLOSE_CALL;
  const cautions = [...d.cautions];
  if (closeCall) cautions.push("Close call: the alternate count scores within a few points of the preferred one.");
  return {
    reason: null,
    setup: {
      version: SETUP_VERSION, degree, kind: d.kind, side: d.side, status: d.status, countId: c.id,
      score, band: band(score), closeCall,
      entry: { ...d.entry, low: r4(d.entry.low), high: r4(d.entry.high) },
      stop: { ...d.stop, price: r4(d.stop.price) },
      target: { ...d.target, price: r4(d.target.price) },
      rr,
      riskPct: Math.round((risk / mid) * 1e4) / 1e4,
      cautions,
    },
  };
}
