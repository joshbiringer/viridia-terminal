import { describe, expect, it } from "vitest";
import { analyzePivots, DEGREES, detectPivots, type PivotBar, type Pivot } from "../supabase/functions/_shared/engine/pivots";
import { generateCandidates, type Candidate } from "../supabase/functions/_shared/engine/candidates";
import { analyzeFib, candidateTargets, confluence, swingLevels, type FibLevel } from "../supabase/functions/_shared/engine/fib";
import { validate, type WavePoint } from "../supabase/functions/_shared/engine/rules";

const pt = (index: number, price: number): WavePoint => ({ index, price, ts: new Date(Date.UTC(2025, 0, 1) + index * 86_400_000).toISOString() });

/** Build a candidate directly from points, via the real validator. */
function cand(pattern: Candidate["pattern"], pts: WavePoint[]): Candidate {
  const v = validate(pattern, pts);
  expect(v.valid).toBe(true);
  const k = pts.length - 1;
  const legUp = (k % 2 === 0) === (v.direction === "up");
  const ruleInv = v.invalidations.filter((x) => x.kind === "rule");
  return {
    id: `${pattern}:t`, version: "t", timeframe: "1d", degree: "intermediate", pattern, subtype: v.subtype, direction: v.direction,
    labels: v.labels, points: pts, complete: v.complete,
    next: v.complete ? { label: "next", direction: v.direction === "up" ? "down" : "up", mustHold: null }
      : { label: v.inProgress!, direction: legUp ? "up" : "down", mustHold: ruleInv[0] ?? null },
    invalidationPrice: v.invalidationPrice, invalidations: v.invalidations,
    evidence: { passed: 0, evaluated: 0, fibMatches: 0, fibTotal: 0 }, spanBars: 0, validation: v,
  };
}
const ctx = { lastIndex: 60, pending: null, lowerPivots: null };
const find = (ls: FibLevel[], re: RegExp) => ls.find((l) => re.test(l.label));

describe("Fibonacci targets per count", () => {
  it("wave 3 projections from the end of wave 2", () => {
    const c = cand("impulse", [pt(0, 100), pt(10, 120), pt(20, 110)]);
    const t = candidateTargets(c, ctx);
    expect(find(t, /Wave 3 = 161.8% of wave 1/)!.price).toBeCloseTo(110 + 1.618 * 20, 6);
    expect(find(t, /Wave 3 = 100% of wave 1/)!.price).toBeCloseTo(130, 6);
  });

  it("wave 4 retracements respect the no-overlap rule", () => {
    // wave 1: 100→110, wave 3: 105→160. 50% of wave 3 = 132.5 (allowed); nothing below 110
    const c = cand("impulse", [pt(0, 100), pt(10, 110), pt(20, 105), pt(40, 160)]);
    const t = candidateTargets(c, ctx);
    expect(find(t, /retraces 38.2% of wave 3/)!.price).toBeCloseTo(160 - 0.382 * 55, 6);
    expect(t.every((l) => l.price > 110)).toBe(true);
  });

  it("wave 5 equality with wave 1 and 61.8% of waves 1–3", () => {
    const c = cand("impulse", [pt(0, 100), pt(10, 120), pt(20, 110), pt(40, 170), pt(50, 150)]);
    const t = candidateTargets(c, ctx);
    expect(find(t, /Wave 5 = 100% of wave 1$/)!.price).toBeCloseTo(170, 6);
    expect(find(t, /Wave 5 = 61.8% of waves 1–3/)!.price).toBeCloseTo(150 + 0.618 * 70, 6);
    const ch = find(t, /Wave 5 channel \(line 2–4 through 3\)$/)!;
    // line 2–4: (20,110)→(50,150), slope 4/3; through 3 (40,170): at bar 60 → 170 + 4/3·20
    expect(ch.price).toBeCloseTo(170 + (40 / 30) * 20, 6);
  });

  it("zigzag C targets: equality and 161.8% of A", () => {
    const c = cand("zigzag", [pt(0, 200), pt(10, 160), pt(20, 180)]);
    const t = candidateTargets(c, ctx);
    expect(find(t, /Wave C = 100% of wave A/)!.price).toBeCloseTo(140, 6);
    expect(find(t, /Wave C = 161.8% of wave A/)!.price).toBeCloseTo(180 - 1.618 * 40, 6);
    expect(t.every((l) => l.price < 180)).toBe(true); // targets lie in the direction of wave C
  });

  it("prior fourth wave of lesser degree for wave 4", () => {
    const c = cand("impulse", [pt(0, 100), pt(10, 110), pt(20, 105), pt(40, 160)]);
    const lower = [{ index: 30, ts: pt(30, 0).ts, price: 131, type: "low" } as Pivot, { index: 25, ts: pt(25, 0).ts, price: 120, type: "low" } as Pivot]
      .sort((a, b) => a.index - b.index);
    const t = candidateTargets(c, { ...ctx, lowerPivots: lower });
    expect(find(t, /prior fourth wave/)!.price).toBe(131);
  });
});

describe("swing levels and confluence", () => {
  it("retracements of the latest swing", () => {
    const piv = [{ index: 0, ts: pt(0, 0).ts, price: 100, type: "low" }, { index: 10, ts: pt(10, 0).ts, price: 200, type: "high" }] as Pivot[];
    const l = swingLevels("minor", piv, null);
    expect(l.map((x) => x.price)).toEqual([200 - 38.2, 200 - 50, 200 - 61.8, 200 - 78.6].map((x) => expect.closeTo(x, 6)));
  });

  it("clusters independent relationships and ignores duplicates of one relationship", () => {
    const mk = (price: number, key: string): FibLevel => ({
      price, kind: "projection", ratio: 1, label: key, source: "Essentials", degree: "minor", candidateId: null, wave: "5",
      primary: true, key, weight: 1, reached: false,
    });
    const levels = { minor: [mk(100, "p:1:a>b"), mk(100.2, "p:1:a>b"), mk(100.3, "r:0.618:c>d"), mk(150, "p:1:e>f")], intermediate: [], primary: [] };
    const z = confluence(levels, 110, 0.5);
    expect(z).toHaveLength(1);
    expect(z[0].count).toBe(2);
    expect(z[0].side).toBe("below");
    expect(z[0].low).toBe(100);
  });

  it("runs end to end on a synthetic series, deterministically", () => {
    const bars: PivotBar[] = [];
    let px = 50, seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 500; i++) {
      const o = px; px = Math.max(1, px * (1 + (rnd() - 0.48) * 0.05));
      bars.push({ ts: new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString(), open: o, high: Math.max(o, px) * 1.005, low: Math.min(o, px) * 0.995, close: px });
    }
    const a = analyzePivots(bars, "1d");
    const input = {
      bars,
      pivots: Object.fromEntries(DEGREES.map((d) => [d, a.degrees[d].pivots])) as Record<(typeof DEGREES)[number], Pivot[]>,
      pending: Object.fromEntries(DEGREES.map((d) => [d, a.degrees[d].pending])) as never,
      candidates: Object.fromEntries(DEGREES.map((d) => [d, generateCandidates({ timeframe: "1d", degree: d, pivots: a.degrees[d].pivots, bars, pending: a.degrees[d].pending })])) as never,
    };
    const f1 = analyzeFib(input), f2 = analyzeFib(input);
    expect(JSON.stringify(f1)).toBe(JSON.stringify(f2));
    for (const z of f1.zones) {
      expect(z.count).toBeGreaterThanOrEqual(2);
      expect(z.high - z.low).toBeLessThanOrEqual(2 * f1.tolerance + 1e-9);
      expect(z.side === "above" ? z.mid >= f1.close : z.mid < f1.close).toBe(true);
    }
    expect(Object.values(f1.levels).flat().every((l) => l.price > 0)).toBe(true);
  });
});

void detectPivots;

import { computeAnalysis } from "../supabase/functions/_shared/engine/analyze";
describe("stored analysis row", () => {
  it("stays small enough to cache for thousands of securities", () => {
    const bars: PivotBar[] = [];
    let px = 80, seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 600; i++) {
      const o = px; px = Math.max(1, px * (1 + (rnd() - 0.49) * 0.06));
      bars.push({ ts: new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString(), open: o, high: Math.max(o, px) * 1.01, low: Math.min(o, px) * 0.99, close: px });
    }
    const t0 = performance.now();
    const a = computeAnalysis(bars, "1d");
    const ms = performance.now() - t0;
    const size = JSON.stringify({ c: a.candidate_counts_json, f: a.fib_level_counts, z: a.confluence_zones_json, p: a.pivots_json }).length;
    const z = (o: unknown) => (require("node:zlib").gzipSync(JSON.stringify(o)).length / 1024).toFixed(1);
    console.log(`analysis: ${ms.toFixed(0)} ms, ${(size / 1024).toFixed(1)} KB raw; gzip cand ${z(a.candidate_counts_json)} KB, zones ${z(a.confluence_zones_json)} KB, pivots ${z(a.pivots_json)} KB`);
    expect(size).toBeLessThan(120_000);
    expect(ms).toBeLessThan(2000);
  });
});
