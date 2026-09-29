import { describe, expect, it } from "vitest";
import { setupFlags } from "../src/lib/analysis/scenario";

const s = (entry: number, stop: number, target: number, rr?: number) => ({
  entry: { low: entry, high: entry }, stop: { price: stop }, target: { price: target }, rr: rr ?? Math.abs(target - entry) / Math.abs(entry - stop), degree: "intermediate",
});

describe("setup sanity checks", () => {
  it("passes a reasonable bullish scenario", () => {
    expect(setupFlags(s(100, 92, 120), "buy", 100, 3)).toEqual([]);
  });
  it("flags the SOXL-style scenario: stop 95% away, target 155% away", () => {
    const f = setupFlags(s(151.45, 7.23, 386.28), "buy", 151.45, 9);
    expect(f).toEqual(expect.arrayContaining(["risk_wide", "atr_wide", "target_far"]));
  });
  it("flags levels on the wrong side, stale analysis and bad reward/risk", () => {
    expect(setupFlags(s(100, 105, 120), "buy", 100, 3)).toContain("wrong_side");
    expect(setupFlags(s(100, 92, 120), "buy", 100, 3, "2026-09-01T00:00:00Z", "2026-09-10T00:00:00Z")).toContain("stale_analysis");
    expect(setupFlags(s(100, 92, 120, 5), "buy", 100, 3)).toContain("rr_mismatch");
    expect(setupFlags(s(100, 99.5, 120), "buy", 100, 3)).toEqual(expect.arrayContaining(["atr_tight", "rr_extreme"]));
  });
});
