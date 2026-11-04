import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analyzeMomentum, type MBar } from "../supabase/functions/_shared/engine/momentum";
import { analyzeConfluence, classOf, WEIGHTS } from "../supabase/functions/_shared/engine/confluence";
import type { CompactCandidate, CompactCandidateSet } from "../supabase/functions/_shared/engine/candidates";
import { technicalFor } from "@/lib/analysis/technical";

const raw = JSON.parse(readFileSync(new URL("./fixtures/aapl-1w.json", import.meta.url), "utf8")) as [string, number, number, number, number, number][];
const AAPL: MBar[] = raw.map(([ts, open, high, low, close, volume]) => ({ ts, open, high, low, close, volume }));

function legs(way: number[], per: number[]): MBar[] {
  const out: MBar[] = [];
  const t0 = Date.parse("2024-01-01T00:00:00Z");
  let prev = way[0];
  const push = (c: number) => {
    const i = out.length;
    out.push({ ts: new Date(t0 + i * 864e5).toISOString(), open: prev, high: Math.max(prev, c) * 1.002, low: Math.min(prev, c) * 0.998, close: c, volume: 1e6 });
    prev = c;
  };
  push(way[0]);
  for (let w = 1; w < way.length; w++) for (let s = 1; s <= per[w - 1]; s++) push(way[w - 1] + ((way[w] - way[w - 1]) * s) / per[w - 1]);
  return out;
}
/** A choppy leg: `steps` advances of (to−from)/steps, each followed by a 45% give-back, 2 bars per swing. */
function chop(from: number, to: number, steps: number): { way: number[]; per: number[] } {
  const way: number[] = [], per: number[] = [], step = (to - from) / steps;
  for (let i = 1; i <= steps; i++) {
    const hi = from + step * i;
    way.push(hi); per.push(2);
    if (i < steps) { way.push(hi - 0.45 * step); per.push(2); }
  }
  return { way, per };
}
/** Bar index where each leg ends. */
const ends = (per: number[]) => per.reduce<number[]>((a, k) => [...a, (a.at(-1) ?? 0) + k], [0]);

function count(bars: MBar[], at: number[], pt: CompactCandidate["pt"], d: "u" | "d", nx: string, complete = false, sc = 65): CompactCandidateSet {
  const kind = (i: number) => ((i % 2 === 1) === (d === "u") ? "high" : "low");
  const c: CompactCandidate = {
    id: `${pt}:test`, pt, st: null, d, c: complete,
    p: at.map((i, k) => [bars[i].ts, kind(k) === "high" ? bars[i].high : bars[i].low]),
    nx: { l: nx, d: (at.length % 2 === 0) === (d === "u") ? "d" : "u", h: null, hs: null, hr: null },
    inv: null, ev: [0, 0, 0, 0], sc,
  };
  return { v: "test", a: null, x: 1, e: 0, eb: [], t: false, c: [c] };
}

describe("confluence index", () => {
  const m = analyzeMomentum(AAPL);
  const r = analyzeConfluence({ bars: AAPL, momentum: m, counts: null, zones: [], degree: "intermediate" });

  it("weights the five layers 30/20/15/15/20", () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(r.components.map((c) => c.key)).toEqual(["wave", "fib", "rsi", "macd", "price"]);
  });

  it("is the sum of the component contributions, within ±100, and classified by its value", () => {
    expect(r.index).toBe(Math.round(r.components.reduce((a, c) => a + c.contribution, 0)));
    expect(Math.abs(r.index)).toBeLessThanOrEqual(100);
    expect(r.classification).toBe(classOf(r.index));
    for (const c of r.components) expect(Math.abs(c.score)).toBeLessThanOrEqual(1);
  });

  it("says so when there is no wave count instead of guessing", () => {
    const w = r.components.find((c) => c.key === "wave")!;
    expect(w.available).toBe(false);
    expect(w.score).toBe(0);
  });

  it("splits evidence into supporting and conflicting by the index's direction", () => {
    const lean = r.index > 0 ? "bullish" : "bearish";
    expect(r.supporting.every((e) => e.lean === lean)).toBe(true);
    expect(r.conflicting.every((e) => e.lean !== lean && e.lean !== "neutral")).toBe(true);
  });

  it("classifies the bands", () => {
    expect(classOf(60)).toBe("strong_bullish"); expect(classOf(25)).toBe("moderate_bullish"); expect(classOf(0)).toBe("neutral");
    expect(classOf(-25)).toBe("moderate_bearish"); expect(classOf(-60)).toBe("strong_bearish");
  });
});

describe("redundancy between RSI and MACD", () => {
  it("scales down the weaker of two agreeing momentum layers", () => {
    const bars = legs([100, 60, 140], [40, 40]);
    const r = analyzeConfluence({ bars, momentum: analyzeMomentum(bars), counts: null, zones: [], degree: "minor" });
    const rsi = r.components.find((c) => c.key === "rsi")!, macd = r.components.find((c) => c.key === "macd")!;
    expect(Math.sign(rsi.score)).toBe(Math.sign(macd.score));
    expect(r.redundancy).toMatch(/counts at 75%/);
  });
});

describe("scenarios", () => {
  it("A: flags a potential bullish wave 3 after a 61.8% wave 2", () => {
    // wave 1: 100 → 130; wave 2: back to 111.5 (61.7%), then turning up
    const per = [12, 20, 10, 4];
    const bars = legs([110, 100, 130, 111.5, 120], per);
    const e = ends(per);
    const r = analyzeConfluence({ bars, momentum: analyzeMomentum(bars), counts: count(bars, [e[1], e[2], e[3]], "impulse", "u", "3"), zones: [], degree: "minor" });
    const s = r.scenarios.find((x) => x.id === "wave3_setup")!;
    expect(s).toBeDefined();
    expect(s.direction).toBe("bullish");
    expect(s.conditions[1].met).toBe(true); // in the 50–61.8% zone
    expect(s.invalidation!.price).toBeCloseTo(bars[e[1]].low, 6); // start of wave 1
    expect(s.targets.map((t) => t.basis)).toContain("Wave 3 = 161.8% of wave 1");
  });

  it("B: flags wave 5 exhaustion when RSI fails to confirm the new high", () => {
    // fast wave 3 to 160, wave 4 to 148, then a choppy wave 5 grinding to a marginal new high
    const five = chop(148, 165, 6);
    const way = [95, 100, 130, 115, 160, 148, ...five.way, 158], per = [10, 10, 6, 6, 8, ...five.per, 8];
    const bars = legs(way, per);
    const e = ends(per);
    const w5 = e[5 + five.way.length];
    const r = analyzeConfluence({ bars, momentum: analyzeMomentum(bars), counts: count(bars, [e[1], e[2], e[3], e[4], e[5], w5], "impulse", "u", "next", true), zones: [], degree: "minor" });
    const s = r.scenarios.find((x) => x.id === "wave5_exhaustion")!;
    expect(s).toBeDefined();
    expect(s.direction).toBe("bearish");
    expect(s.conditions.find((c) => c.label.startsWith("Price made a new high"))!.met).toBe(true);
    expect(s.conditions.find((c) => c.label.startsWith("RSI lower high"))!.met).toBe(true);
    expect(s.targets[0].basis).toMatch(/End of wave 4/);
  });

  it("C: flags a bullish ABC completion with a regular bullish divergence", () => {
    // A: sharp drop to 120; B: bounce to 134; C: choppy grind to a lower low at 114; then a recovery
    const c = chop(134, 114, 6);
    const way = [150, 160, 120, 134, ...c.way, 132], per = [10, 8, 6, 6, ...c.per, 10];
    const bars = legs(way, per);
    const e = ends(per);
    const cEnd = e[3 + c.way.length];
    const r = analyzeConfluence({ bars, momentum: analyzeMomentum(bars), counts: count(bars, [e[1], e[2], e[3], cEnd], "zigzag", "d", "next", true), zones: [], degree: "minor" });
    const s = r.scenarios.find((x) => x.id === "abc_completion")!;
    expect(s).toBeDefined();
    expect(s.direction).toBe("bullish");
    expect(s.conditions[2].met).toBe(true); // RSI divergence between the A and C lows
    // price has recovered to 132, so only levels still ahead of it count as targets
    expect(s.targets.every((t) => t.price > bars.at(-1)!.close)).toBe(true);
    // the end of wave B is the confirmation level, so it isn't repeated as a target
    expect(s.confirmation!.basis).toMatch(/end of wave B/);
    expect(s.targets.map((t) => t.basis)).toEqual(["Start of wave A"]);
  });

  it("only offers scenarios that fit the count's state", () => {
    const bars = legs([110, 100, 130, 111.5, 120], [12, 20, 10, 4]);
    const e = ends([12, 20, 10, 4]);
    const r = analyzeConfluence({ bars, momentum: analyzeMomentum(bars), counts: count(bars, [e[1], e[2], e[3]], "impulse", "u", "3"), zones: [], degree: "minor" });
    expect(r.scenarios.map((s) => s.id)).toEqual(["wave3_setup"]);
  });
});

describe("technical payload", () => {
  it("aligns every series with the bars and covers each degree", () => {
    const t = technicalFor(AAPL, "1w")!;
    expect(t.series.rsi).toHaveLength(AAPL.length);
    expect(t.series.hist).toHaveLength(AAPL.length);
    expect(Object.keys(t.confluence).sort()).toEqual(["intermediate", "minor", "primary"]);
    // the preferred intermediate count matches the stored worker analysis for this fixture (parity check of 2026-11-04)
    expect(t.waves.intermediate.preferred?.pattern).toBe("ending_diagonal");
    expect(t.confluence.intermediate.preferredId).toBe(t.waves.intermediate.preferred?.id);
  });

  it("marks a still-forming intraday bar as open", () => {
    const bars = AAPL.map((b, i) => ({ ...b, ts: new Date(Date.parse("2026-01-01T00:00:00Z") + i * 3_600_000).toISOString() }));
    const now = Date.parse(bars.at(-1)!.ts) + 30 * 60_000;
    expect(technicalFor(bars, "1h", now)!.lastBarOpen).toBe(true);
    expect(technicalFor(bars, "1h", now + 3_600_000)!.lastBarOpen).toBe(false);
  });

  it("is fast enough for a 1,500-bar hourly chart", () => {
    const long: MBar[] = [];
    for (let k = 0; k < 14; k++) for (const b of AAPL) long.push({ ...b, ts: new Date(Date.parse("2020-01-01T00:00:00Z") + long.length * 3_600_000).toISOString(), close: b.close * (1 + k * 0.01), high: b.high * (1 + k * 0.01), low: b.low * (1 + k * 0.01), open: b.open * (1 + k * 0.01) });
    const bars = long.slice(0, 1500);
    const t0 = performance.now();
    technicalFor(bars, "1h");
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
