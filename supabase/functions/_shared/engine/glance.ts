/**
 * "Structure at a glance": the preferred and alternate counts for one security, reduced to what a
 * reader needs first. Works on the stored compact form, so the worker (which writes the scanner
 * columns) and the app (which renders the card) derive it from the same data the same way.
 */
import type { CompactCandidate, CompactCandidateSet } from "./candidates.ts";
import type { Degree } from "./pivots.ts";
import { alternateIndex, band, CLOSE_CALL, scenarioKey, type ConfidenceBand } from "./rank.ts";

/** Degree shown first when the reader has not chosen one: intermediate is the swing-trading degree. */
export const GLANCE_DEGREES: Degree[] = ["intermediate", "primary", "minor"];

export interface GlanceCount {
  id: string;
  pattern: CompactCandidate["pt"];
  subtype: string | null;
  direction: "up" | "down";
  complete: boolean;
  /** Wave in progress ("3", "5", "C"…) or "next" after a complete pattern. */
  wave: string;
  waveDirection: "up" | "down";
  score: number;
  band: ConfidenceBand;
  /** Level the wave in progress must hold (rule-based), else the count's nearest invalidation. */
  hold: number | null;
  holdSide: "above" | "below" | null;
  /** Nearest unreached Fibonacci target for the wave in progress. */
  target: { price: number; label: string } | null;
  /**
   * For a finished pattern, the price at its last point: beyond it the final wave is still extending,
   * so the pattern is not finished after all. Not a rule level (the rules define none in this state).
   */
  reassess: number | null;
  reassessSide: "above" | "below" | null;
  /** The count's last labeled point (where the current, unconfirmed move began). */
  last: { ts: string; price: number };
}

export interface Glance {
  degree: Degree;
  preferred: GlanceCount;
  alternate: GlanceCount | null;
  /** Preferred and alternate are within CLOSE_CALL points: the structure is ambiguous. */
  closeCall: boolean;
  /** Rule-valid counts at this degree (up to the stored limit). */
  valid: number;
  /** Of those, how many expect the same direction for the move in progress as the preferred count. */
  agree: number;
}

function toGlance(c: CompactCandidate): GlanceCount {
  const score = c.sc ?? 50;
  const primary = (c.tg ?? []).find((t) => t[2]) ?? (c.tg ?? [])[0];
  const hold = c.nx.h ?? c.inv;
  const holdSide = c.nx.h != null ? c.nx.hs
    : c.inv == null ? null
    // a count's invalidation lies against the wave in progress
    : (c.nx.d === "u" ? "below" : "above");
  return {
    id: c.id, pattern: c.pt, subtype: c.st, direction: c.d === "u" ? "up" : "down", complete: c.c,
    wave: c.nx.l, waveDirection: c.nx.d === "u" ? "up" : "down",
    score, band: band(score), hold, holdSide,
    target: primary ? { price: primary[0], label: primary[1] } : null,
    reassess: c.c ? c.p[c.p.length - 1][1] : null,
    // a finished up-pattern ends at a high: a higher high means its last wave is still going
    reassessSide: c.c ? (c.d === "u" ? "above" : "below") : null,
    last: { ts: c.p[c.p.length - 1][0], price: c.p[c.p.length - 1][1] },
  };
}

export const compactScenario = (c: CompactCandidate) => scenarioKey(c.pt, c.c, c.nx.l, c.nx.d === "u" ? "up" : "down");

export function glanceOf(sets: Partial<Record<Degree, CompactCandidateSet | null>>, prefer?: Degree | "auto" | null): Glance | null {
  const order = prefer && prefer !== "auto" ? [prefer, ...GLANCE_DEGREES.filter((d) => d !== prefer)] : GLANCE_DEGREES;
  for (const degree of order) {
    const c = sets[degree]?.c ?? [];
    if (!c.length) continue;
    const preferred = toGlance(c[0]);
    // the alternate tells a different story (see rank.ts scenarioKey), not the same one from another start
    const ai = alternateIndex(c, compactScenario);
    const alternate = ai > 0 ? toGlance(c[ai]) : null;
    return {
      degree, preferred, alternate, valid: c.length, agree: c.filter((x) => x.nx.d === c[0].nx.d).length,
      closeCall: !!alternate && preferred.score - alternate.score < CLOSE_CALL,
    };
  }
  return null;
}
