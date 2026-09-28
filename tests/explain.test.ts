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
});
