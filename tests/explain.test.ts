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

describe("Explain to client", () => {
  it("avoids Elliott jargon and always carries the not-a-recommendation note", async () => {
    const { clientAnswer, answerText } = await import("../src/lib/analysis/explain");
    const g = { degree: "intermediate", valid: 3, agree: 3, closeCall: false, alternate: null,
      preferred: { id: "x", pattern: "impulse", subtype: null, direction: "up", complete: false, wave: "3", waveDirection: "up", score: 72, band: "high",
        hold: 100, holdSide: "below", target: { price: 150, label: "t" }, reassess: null, reassessSide: null, last: { ts: "2026-09-01", price: 110 } } };
    const ctx = { symbol: "TEST", degree: "intermediate" as const, close: 120, glances: { auto: g, intermediate: g, primary: null, minor: null } as never, candidates: null, zones: [], setups: null };
    for (const id of ["why", "invalidate", "targets", "setup"] as const) {
      const t = answerText(clientAnswer(id, ctx));
      expect(t).not.toMatch(/wave|impulse|zigzag|Fibonacci|Pattern Confidence/i);
      expect(t).toContain("isn't a prediction or a recommendation");
    }
    expect(answerText(clientAnswer("why", ctx))).toContain("strongest part of a rise");
  });
});
