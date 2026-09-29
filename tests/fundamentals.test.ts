import { describe, expect, it } from "vitest";
import { fundamentalDims, ratios, type Fundamentals } from "../src/lib/fundamentals/model";

const f = (p: Partial<Fundamentals>): Fundamentals => ({
  symbol: "X", sector: "Information Technology", industry: "Semiconductors", fy_end: "2025-12-31", revenue: 1000, revenue_prior: 800,
  net_income: 100, operating_income: 150, gross_profit: 600, shares: 10, shares_as_of: "2026-06-30", market_cap: 3000, multi_class: false, revenue_concept: "Revenues", ...p,
});
const sector = { sector: "Information Technology", n: 200, pe: 25, ps: 4, op_margin: 0.12, growth: 0.08 };

describe("fundamentals", () => {
  it("computes growth, margins and multiples", () => {
    const r = ratios(f({}));
    expect(r.growth).toBeCloseTo(0.25);
    expect(r.opMargin).toBeCloseTo(0.15);
    expect(r.pe).toBeCloseTo(30);
    expect(r.ps).toBeCloseTo(3);
  });
  it("uses P/S when earnings are negative and never divides by a loss", () => {
    const r = ratios(f({ net_income: -50 }));
    expect(r.pe).toBeNull();
    const [, val] = fundamentalDims(f({ net_income: -50 }), sector);
    expect(val.detail).toMatch(/P\/S/);
  });
  it("states growth and compares valuation with the sector", () => {
    const [fun, val] = fundamentalDims(f({}), sector);
    expect(fun.state).toBe("Growing");
    expect(val.state).toBe("In line with sector");
    expect(fundamentalDims(f({ market_cap: 6000 }), sector)[1].state).toBe("Above sector");
  });
  it("says why a figure is missing instead of guessing", () => {
    expect(fundamentalDims(null, null)[0].tone).toBe("na");
    expect(fundamentalDims(f({ market_cap: null, multi_class: true }), sector)[1].state).toBe("Not computed");
  });
});
