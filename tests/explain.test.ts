import { describe, expect, it } from "vitest";
import { QUESTIONS, answer, route } from "../src/lib/analysis/explain";
import type { ExplainContext } from "../src/lib/analysis/explain";

const empty: ExplainContext = { symbol: "TEST", degree: "intermediate", close: 100, glances: null, candidates: null, zones: [], setups: null };

describe("Ask Viridia", () => {
  it("routes typed questions to the built-in ones", () => {
    expect(route("what would invalidate this?")).toBe("invalidate");
    expect(route("Where are the fib targets")).toBe("targets");
    expect(route("is this a buy?")).toBe("setup");
    expect(route("compare weekly")).toBe("weekly");
    expect(route("what's the weather")).toBeNull();
  });
  it("says there is nothing to explain instead of inventing an answer", () => {
    for (const q of QUESTIONS) {
      const a = answer(q.id, empty);
      expect(a.blocks.length).toBeGreaterThan(0);
      expect(a.title.length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(answer("why", empty))).toContain("no rule-valid wave count");
    expect(JSON.stringify(answer("setup", empty))).toContain("doesn't define a setup");
  });

  it("compares two stored days and reports only what changed", () => {
    const day = (d: string, o: object) => ({ day: d, degree: "intermediate", pattern: "impulse", complete: false, wave: "3", wave_dir: "up", score: 70, hold: 100, setup_side: "buy", setup_kind: "wave3", ...o });
    const same = answer("changed", { ...empty, history: [day("2026-09-29", {}), day("2026-09-28", {})] });
    expect(JSON.stringify(same)).toContain("Nothing material changed");
    const moved = answer("changed", { ...empty, history: [day("2026-09-29", { wave: "4", wave_dir: "down", score: 64, setup_side: null, setup_kind: null }), day("2026-09-28", {})] });
    const text = JSON.stringify(moved);
    expect(text).toContain("Pattern Confidence: 70 → 64");
    expect(text).toContain("Setup: buy");
    const none = answer("changed", { ...empty, history: [day("2026-09-28", {})] });
    expect(JSON.stringify(none)).toContain("previous day");
  });
});
