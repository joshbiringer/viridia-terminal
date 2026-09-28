/**
 * "Structure at a glance": the preferred and alternate counts for one security, reduced to what a
 * reader needs first. Works on the stored compact form, so the worker (which writes the scanner
 * columns) and the app (which renders the card) derive it from the same data the same way.
 */
import type { CompactCandidate, CompactCandidateSet } from "./candidates.ts";
import type { Degree } from "./pivots.ts";
import { band, CLOSE_CALL, type ConfidenceBand } from "./rank.ts";

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
}

export interface Glance {
  degree: Degree;
  preferred: GlanceCount;
  alternate: GlanceCount | null;
  /** Preferred and alternate are within CLOSE_CALL points: the structure is ambiguous. */
  closeCall: boolean;
  /** Rule-valid counts at this degree (up to the stored limit). */
  valid: number;
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
  };
}

export function glanceOf(sets: Partial<Record<Degree, CompactCandidateSet | null>>, prefer?: Degree | "auto" | null): Glance | null {
  const order = prefer && prefer !== "auto" ? [prefer, ...GLANCE_DEGREES.filter((d) => d !== prefer)] : GLANCE_DEGREES;
  for (const degree of order) {
    const c = sets[degree]?.c ?? [];
    if (!c.length) continue;
    const preferred = toGlance(c[0]);
    const alternate = c[1] ? toGlance(c[1]) : null;
    return {
      degree, preferred, alternate, valid: c.length,
      closeCall: !!alternate && preferred.score - alternate.score < CLOSE_CALL,
    };
  }
  return null;
}
