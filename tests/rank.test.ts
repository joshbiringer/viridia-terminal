import { describe, expect, it } from "vitest";
import { detectPivots, type PivotBar } from "../supabase/functions/_shared/engine/pivots";
import { generateCandidates, compactSet } from "../supabase/functions/_shared/engine/candidates";
import {
  FACTOR_IDS, band, decodeFactors, encodeFactors, rankCandidate, scoreOf,
} from "../supabase/functions/_shared/engine/rank";
import { compactScenario, glanceOf } from "../supabase/functions/_shared/engine/glance";

/** Straight-line legs between waypoints; per-leg volume so wave personality can be tested. */
function path(waypoints: number[], vols?: number[], barsPerLeg = 10): PivotBar[] {
  const out: PivotBar[] = [];
  const t0 = Date.parse("2024-01-01T00:00:00Z");
  let prev = waypoints[0];
  const push = (close: number, open: number, volume: number) => {
    const i = out.length;
    out.push({ ts: new Date(t0 + i * 86_400_000).toISOString(), open, high: Math.max(open, close) * 1.001, low: Math.min(open, close) * 0.999, close, volume });
  };
  push(prev, prev, vols?.[0] ?? 1e6);
  for (let w = 1; w < waypoints.length; w++) {
    const a = waypoints[w - 1], b = waypoints[w];
    for (let s = 1; s <= barsPerLeg; s++) { const c = a + ((b - a) * s) / barsPerLeg; push(c, prev, vols?.[w - 1] ?? 1e6); prev = c; }
  }
  return out;
}
const run = (bars: PivotBar[]) => {
  const s = detectPivots(bars, "1d", "minor");
  return generateCandidates({ timeframe: "1d", degree: "minor", pivots: s.pivots, bars, pending: s.pending });
};
// a decline into the start, so the count begins at an extreme, then a textbook impulse and a pullback
const WAY = [140, 100, 130, 112, 175, 158, 190, 170];
const impulseId = (bars: PivotBar[]) => run(bars).candidates.find((c) => c.pattern === "impulse" && c.complete && Math.abs(c.points[0].price - 100) < 1)!;

describe("Pattern Confidence", () => {
  it("scores 50 with no evidence and moves with the evidence ratio", () => {
    expect(scoreOf(0, 0)).toBe(50);
    expect(scoreOf(2, 2)).toBe(67);
    expect(scoreOf(0, 4)).toBe(25);
    expect(band(70)).toBe("high"); expect(band(58)).toBe("medium"); expect(band(57)).toBe("low");
  });

  it("rewards wave-5 volume divergence and punishes its absence", () => {
    const healthy = path(WAY, [2e6, 1.2e6, 0.8e6, 3e6, 1e6, 1.5e6, 1e6]);   // w3 heaviest, w5 lighter
    const inverted = path(WAY, [2e6, 3e6, 0.8e6, 1.2e6, 1e6, 3.5e6, 1e6]);  // w5 heavier than w3
    const a = impulseId(healthy), b = impulseId(inverted);
    const f = (c: typeof a, id: string) => c.rank!.factors.find((x) => x.id === id)?.pass;
    expect(f(a, "personality.w5_volume")).toBe(true);
    expect(f(a, "personality.w3_volume")).toBe(true);
    expect(f(b, "personality.w5_volume")).toBe(false);
    expect(a.rank!.score).toBeGreaterThan(b.rank!.score);
  });

  it("leaves volume checks out when volume is missing, instead of guessing", () => {
    const bars = path(WAY).map((b) => ({ ...b, volume: null }));
    const c = impulseId(bars);
    expect(c.rank!.factors.some((x) => x.id.includes("volume"))).toBe(false);
    expect(c.rank!.factors.some((x) => x.id === "personality.w3_velocity")).toBe(true);
  });

  it("credits a count that starts at the prior extreme", () => {
    const c = impulseId(path(WAY));
    expect(c.rank!.factors.find((x) => x.id === "personality.start_extreme")?.pass).toBe(true);
  });

  it("is reproducible from the candidate alone", () => {
    const bars = path(WAY);
    const c = impulseId(bars);
    expect(rankCandidate(c, bars)).toEqual(c.rank);
  });

  it("credits alternate waves in Fibonacci ratio (wave 5 = wave 1)", () => {
    const equal = impulseId(path([140, 100, 130, 112, 175, 158, 188, 170]));  // w1 = 30, w5 = 30
    const off = impulseId(path(WAY));                                          // w5 = 32 (6.7% off)
    const f = (c: typeof equal) => c.rank!.factors.find((x) => x.id === "fib.alternate_ratio")?.pass;
    expect(f(equal)).toBe(true);
    expect(f(off)).toBe(false);
  });

  it("marks running flats as the rare variation", () => {
    const set = run(path([90, 120, 100, 125, 105, 118]));
    const running = set.candidates.find((c) => c.pattern === "flat" && c.subtype === "running");
    expect(running).toBeDefined();
    expect(running!.rank!.factors.find((x) => x.id === "flat.not_running")?.pass).toBe(false);
  });

  it("round-trips factors through compact storage", () => {
    const c = impulseId(path(WAY));
    expect(decodeFactors(encodeFactors(c.rank!.factors))).toEqual(c.rank!.factors);
    expect(new Set(FACTOR_IDS).size).toBe(FACTOR_IDS.length);
  });

  it("stores factors only for the preferred and alternate counts", () => {
    const s = compactSet(run(path(WAY)));
    expect(s.c[0].fx).toBeDefined();
    const withFx = s.c.map((c, i) => (c.fx ? i : -1)).filter((i) => i >= 0);
    expect(withFx.length).toBeLessThanOrEqual(2);
    expect(withFx[0]).toBe(0);
    expect(s.c.every((c) => typeof c.sc === "number")).toBe(true);
  });
});

describe("Structure at a glance", () => {
  const s = compactSet(run(path(WAY)));
  it("picks the preferred and alternate from the ranked list", () => {
    const g = glanceOf({ minor: s })!;
    expect(g.degree).toBe("minor");
    expect(g.preferred.id).toBe(s.c[0].id);
    expect(g.closeCall).toBe(!!g.alternate && g.preferred.score - g.alternate.score < 5);
  });
  it("picks an alternate that tells a different story, the best-ranked one", () => {
    const g = glanceOf({ minor: s })!;
    const key = (c: (typeof s.c)[number]) => compactScenario(c);
    if (g.alternate) {
      const ai = s.c.findIndex((c) => c.id === g.alternate!.id);
      expect(key(s.c[ai])).not.toBe(key(s.c[0]));
      expect(s.c.slice(1, ai).every((c) => key(c) === key(s.c[0]))).toBe(true);
      expect(s.c[ai].fx).toBeDefined();
    } else {
      expect(s.c.every((c) => key(c) === key(s.c[0]))).toBe(true);
    }
    expect(g.agree).toBeGreaterThanOrEqual(1);
  });
  it("gives a finished pattern a reassess level at its last point", () => {
    const g = glanceOf({ minor: s })!;
    const c = s.c.find((x) => x.c);
    if (c) {
      const one = glanceOf({ minor: { ...s, c: [c] } })!;
      expect(one.preferred.reassess).toBe(c.p[c.p.length - 1][1]);
      expect(one.preferred.reassessSide).toBe(c.d === "u" ? "above" : "below");
    }
    expect(g.preferred.last.price).toBe(s.c[0].p[s.c[0].p.length - 1][1]);
  });
  it("falls back through degrees and returns null with no counts", () => {
    expect(glanceOf({ intermediate: { ...s, c: [] }, minor: s })!.degree).toBe("minor");
    expect(glanceOf({})).toBeNull();
  });
  it("honors a chosen degree when it has counts", () => {
    expect(glanceOf({ intermediate: s, minor: s }, "minor")!.degree).toBe("minor");
  });
});
