import { describe, expect, it } from "vitest";
import { detectPivots, type PivotBar } from "../supabase/functions/_shared/engine/pivots";
import { generateCandidates, compactSet, byCoverage } from "../supabase/functions/_shared/engine/candidates";
import { validate } from "../supabase/functions/_shared/engine/rules";

/** Bars that walk in straight lines between waypoints, with a small intrabar range. */
function path(waypoints: number[], barsPerLeg = 10): PivotBar[] {
  const out: PivotBar[] = [];
  const t0 = Date.parse("2024-01-01T00:00:00Z");
  let prev = waypoints[0];
  const push = (close: number, open: number) => {
    const i = out.length;
    const hi = Math.max(open, close) * 1.001, lo = Math.min(open, close) * 0.999;
    out.push({ ts: new Date(t0 + i * 86_400_000).toISOString(), open, high: hi, low: lo, close });
  };
  push(prev, prev);
  for (let w = 1; w < waypoints.length; w++) {
    const a = waypoints[w - 1], b = waypoints[w];
    for (let s = 1; s <= barsPerLeg; s++) {
      const c = a + ((b - a) * s) / barsPerLeg;
      push(c, prev);
      prev = c;
    }
  }
  return out;
}

const run = (bars: PivotBar[]) => {
  const s = detectPivots(bars, "1d", "minor");
  return generateCandidates({ timeframe: "1d", degree: "minor", pivots: s.pivots, bars, pending: s.pending });
};

describe("candidate generation", () => {
  // textbook bull impulse, then the start of a decline so wave 5's top is a confirmed pivot
  const impulse = [100, 130, 112, 175, 158, 190, 170];
  const bars = path(impulse);

  it("finds the textbook impulse as a complete count", () => {
    const set = run(bars);
    const imp = set.candidates.find((c) => c.pattern === "impulse" && c.complete);
    expect(imp).toBeDefined();
    expect(imp!.points.map((p) => Math.round(p.price))).toEqual([100, 130, 112, 175, 158, 190].map((x) => Math.round(x * 1.001 * (x === 100 || x === 112 || x === 158 ? 0.999 / 1.001 : 1))));
    expect(imp!.direction).toBe("up");
    expect(imp!.next.label).toBe("next");
    expect(imp!.next.direction).toBe("down");
  });

  it("returns only counts with no rule violations", () => {
    const set = run(bars);
    expect(set.candidates.length).toBeGreaterThan(0);
    for (const c of set.candidates) {
      expect(c.validation.ruleViolations).toEqual([]);
      const again = validate(c.pattern, c.points, { bars });
      expect(again.ruleViolations.filter((r) => r.id !== "structure.live")).toEqual([]);
    }
  });

  it("anchors every count on the latest confirmed pivot", () => {
    const set = run(bars);
    for (const c of set.candidates) expect(c.points.at(-1)!.ts).toBe(set.anchor!.ts);
  });

  it("rejects an impulse whose wave 4 overlaps wave 1", () => {
    const overlap = path([100, 130, 112, 175, 125, 190, 170]); // wave 4 low 125 < wave 1 high 130
    const set = run(overlap);
    const imp = set.candidates.filter((c) => c.pattern === "impulse" && c.points.length === 6 && Math.round(c.points[0].price) === 100);
    expect(imp).toEqual([]);
    // the same shape is still admissible as a diagonal if its legs fit
    expect(set.eliminatedBy.some((e) => e.ruleId === "impulse.w4_no_overlap")).toBe(true);
  });

  it("labels an incomplete impulse with the wave in progress and its invalidation", () => {
    const partial = path([100, 130, 112, 175, 158]); // waves 1–3 done, wave 4 confirmed low not yet
    const s = detectPivots(partial, "1d", "minor");
    const set = generateCandidates({ timeframe: "1d", degree: "minor", pivots: s.pivots, bars: partial, pending: s.pending });
    const c = set.candidates.find((x) => x.pattern === "impulse" && x.points.length === 4 && Math.round(x.points[0].price) === 100);
    expect(c).toBeDefined();
    expect(c!.next.label).toBe("4");
    expect(c!.next.direction).toBe("down");
    expect(c!.invalidationPrice).toBeCloseTo(130 * 1.001, 3); // wave 4 may not enter wave 1 territory
  });

  it("eliminates counts whose rule level was crossed after the anchor", () => {
    // after wave 3 tops at 175, price falls through wave 1's high (130): no 1-2-3 impulse from 100 survives
    const broken = path([100, 130, 112, 175, 120]);
    const s = detectPivots(broken, "1d", "minor");
    const set = generateCandidates({ timeframe: "1d", degree: "minor", pivots: s.pivots, bars: broken, pending: s.pending });
    const c = set.candidates.find((x) => x.pattern === "impulse" && x.points.length === 4 && Math.round(x.points[0].price) === 100);
    expect(c).toBeUndefined();
  });

  it("is deterministic and sorted by coverage", () => {
    const a = run(bars), b = run(bars);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const sorted = [...a.candidates].sort(byCoverage);
    expect(sorted.map((c) => c.id)).toEqual(a.candidates.map((c) => c.id));
  });

  it("has no look-ahead: a prefix of the bars only sees counts built from its own pivots", () => {
    const full = path([100, 130, 112, 175, 158, 190, 170, 182, 150], 8);
    for (let t = 30; t <= full.length; t += 7) {
      const pre = full.slice(0, t);
      const set = run(pre);
      for (const c of set.candidates) for (const p of c.points) expect(p.index).toBeLessThan(t);
    }
  });

  it("finds a zigzag correction", () => {
    const zz = path([200, 160, 180, 130, 145]);
    const set = run(zz);
    expect(set.candidates.some((c) => c.pattern === "zigzag" && c.complete && c.direction === "down")).toBe(true);
  });

  it("stays fast on noisy data and compacts for storage", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const noisy: PivotBar[] = [];
    let px = 50;
    for (let i = 0; i < 600; i++) {
      const o = px; px = Math.max(1, px * (1 + (rnd() - 0.5) * 0.06));
      noisy.push({ ts: new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString(), open: o, high: Math.max(o, px) * (1 + rnd() * 0.01), low: Math.min(o, px) * (1 - rnd() * 0.01), close: px });
    }
    const t = performance.now();
    const set = run(noisy);
    expect(performance.now() - t).toBeLessThan(1500);
    const c = compactSet(set);
    expect(c.c.length).toBeLessThanOrEqual(12);
    expect(JSON.stringify(c).length).toBeLessThan(20_000);
  });
});
