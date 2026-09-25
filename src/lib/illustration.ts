/**
 * Synthetic data for marketing illustrations. It is NOT market data and is always shown with an
 * "Illustrative example" label. One series is shared by every landing-page visual so the numbers agree.
 */

import { validateImpulse } from "@engine/rules";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Candle { i: number; o: number; h: number; l: number; c: number }
export interface Pivot { i: number; p: number; kind: "high" | "low" }

/** Anchor points: a decline into the wave-1 origin, then waves 1, 2 and an unfinished wave 3. */
const ANCHORS: Pivot[] = [
  { i: 0, p: 45.6, kind: "high" },
  { i: 10, p: 40.0, kind: "low" },   // origin of wave 1
  { i: 26, p: 48.2, kind: "high" },  // wave 1
  { i: 38, p: 43.5, kind: "low" },   // wave 2 (57% retracement)
  { i: 72, p: 55.6, kind: "high" },  // wave 3, still advancing
];

/** The example count, checked by the real rule engine so the illustration can't contradict it. */
export const EXAMPLE_VALIDATION = validateImpulse(ANCHORS.slice(1, 4).map((a) => ({ index: a.i, ts: `2025-01-${String(a.i % 28 + 1).padStart(2, "0")}`, price: a.p })));

export const EXAMPLE = {
  origin: ANCHORS[1], w1: ANCHORS[2], w2: ANCHORS[3], w3: ANCHORS[4],
  /** Rule-based: wave 2 can't retrace beyond the wave 1 origin. */
  invalidation: EXAMPLE_VALIDATION.invalidationPrice!,
  /** Count-level: below the wave 2 low, wave 3 hasn't begun. */
  countLevel: EXAMPLE_VALIDATION.invalidations.find((v) => v.kind === "count")!.price,
  zone: { lo: 56.8, hi: 58.2 },
  ext1618: 43.5 + 1.618 * (48.2 - 40.0), // 56.77
  retrace2: (48.2 - 43.5) / (48.2 - 40.0), // 0.573
  confidence: 84,
  altConfidence: 21,
};

export function exampleSeries(): Candle[] {
  const rnd = mulberry32(20260924);
  const path: number[] = [];
  for (let s = 0; s < ANCHORS.length - 1; s++) {
    const a = ANCHORS[s], b = ANCHORS[s + 1], n = b.i - a.i;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const bridge = Math.sin(Math.PI * t) * (rnd() - 0.5) * 1.6; // noise pinned to zero at the pivots
      path.push(a.p + (b.p - a.p) * t + bridge);
    }
  }
  path.push(ANCHORS.at(-1)!.p);

  const pivotAt = new Map(ANCHORS.map((p) => [p.i, p]));
  return path.map((c, i) => {
    const o = i ? path[i - 1] : c + 0.3;
    let h = Math.max(o, c) + rnd() * 0.45;
    let l = Math.min(o, c) - rnd() * 0.45;
    const pv = pivotAt.get(i);
    if (pv?.kind === "high") h = pv.p;
    if (pv?.kind === "low") l = pv.p;
    // keep pivots the true extremes of their neighbourhood
    for (const q of ANCHORS) {
      if (Math.abs(q.i - i) <= 3 && q.i !== i) {
        if (q.kind === "high") h = Math.min(h, q.p - 0.05);
        if (q.kind === "low") l = Math.max(l, q.p + 0.05);
      }
    }
    return { i, o, h: Math.max(h, o, c), l: Math.min(l, o, c), c };
  });
}
