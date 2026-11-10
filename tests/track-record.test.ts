import { describe, expect, it } from "vitest";
import { bucketTotals, daysSince, type ScoreBucket } from "../src/lib/analysis/track-record";

const b = (bucket: number, side: "buy" | "sell", resolved: number, avg_r: number): ScoreBucket => ({ bucket, side, trials: resolved + 5, resolved, targets: Math.round(resolved / 4), positive: Math.round(resolved / 3), avg_r });

describe("score buckets", () => {
  it("combines sides into resolved-weighted averages, highest band first", () => {
    const t = bucketTotals([b(70, "buy", 300, 0.2), b(70, "sell", 100, -0.4), b(80, "buy", 50, 0.1)]);
    expect(t.map((x) => x.bucket)).toEqual([80, 70]);
    expect(t[1].resolved).toBe(400);
    expect(t[1].avgR).toBeCloseTo((300 * 0.2 + 100 * -0.4) / 400);
  });
  it("filters to one side", () => {
    const t = bucketTotals([b(70, "buy", 300, 0.2), b(70, "sell", 100, -0.4)], "sell");
    expect(t[0].avgR).toBeCloseTo(-0.4);
  });
  it("leaves an empty band's average undefined rather than zero", () => {
    expect(bucketTotals([b(60, "buy", 0, 0)])[0].avgR).toBeNull();
  });
  it("counts whole days since a timestamp", () => {
    expect(daysSince("2026-11-01T00:00:00Z", Date.parse("2026-11-10T12:00:00Z"))).toBe(9);
    expect(daysSince(null)).toBeNull();
  });
});
