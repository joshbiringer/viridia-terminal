import { describe, expect, it } from "vitest";
import { driftOf, parseHoldings, xray, type Context } from "../src/lib/portfolio/xray";

const ctx = (symbol: string, close: number, sub = "common"): Context => ({
  symbol, name: symbol, asset_subtype: sub, close, prev_close: close, trend: "uptrend", glance_pattern: "impulse", glance_complete: false,
  glance_wave: "3", glance_wave_dir: "up", glance_score: 70, glance_hold: null, setup_side: null, setup_kind: null, setup_rr: null, weekly_dir: "up",
});
const closes = (f: (i: number) => number) => Array.from({ length: 253 }, (_, i) => ({ ts: new Date(Date.UTC(2025, 0, 1) + i * 864e5).toISOString(), close: f(i) }));

describe("Portfolio X-Ray", () => {
  it("parses headers, plain lines, totals and US dates, and combines duplicates", () => {
    const a = parseHoldings("Ticker,Quantity,Cost Basis,Date Acquired\naapl,10,\"$1,500.00\",3/5/2024\nAAPL,10,2500,2025-01-02");
    expect(a.holdings).toEqual([{ symbol: "AAPL", shares: 20, avgCost: 200, acquired: "2024-03-05" }]);
    const b = parseHoldings("VTI 250\nnvda,40,120.5\nbad line");
    expect(b.holdings.map((h) => h.symbol)).toEqual(["VTI", "NVDA"]);
    expect(b.holdings[1].avgCost).toBe(120.5);
    expect(b.errors).toHaveLength(1);
  });
  it("measures weights, concentration, gains and leaves out unknown symbols", () => {
    const { holdings } = parseHoldings("AAA,30,50\nBBB,10,100\nZZZ,5");
    const m = new Map([["AAA", closes((i) => 100 + i * 0.1)], ["BBB", closes((i) => 100 + Math.sin(i))], ["SPY", closes((i) => 100 + i * 0.05)]]);
    const r = xray(holdings, [ctx("AAA", 100), ctx("BBB", 100, "etf")], m);
    expect(r.unknown).toEqual(["ZZZ"]);
    expect(r.total).toBe(4000);
    expect(r.positions[0]).toMatchObject({ symbol: "AAA", weight: 0.75, gain: 1500 });
    expect(r.concentration.over20.map((p) => p.symbol)).toEqual(["AAA", "BBB"]);
    expect(r.concentration.effective).toBeCloseTo(1 / (0.75 ** 2 + 0.25 ** 2), 6);
    expect(r.mix).toMatchObject({ stocks: 0.75, etfs: 0.25 });
    expect(r.tax!.gain).toBe(1500);
    expect(r.structure.up).toBe(1);
    expect(r.sectors).toEqual([{ sector: "Unclassified", weight: 0.75, symbols: ["AAA"] }, { sector: "Funds (not looked through)", weight: 0.25, symbols: ["BBB"] }]);
    const s = xray(holdings, [{ ...ctx("AAA", 100), sector: "Energy" }, ctx("BBB", 100, "etf")], m);
    expect(s.sectors[0]).toMatchObject({ sector: "Energy", weight: 0.75 });
  });
});

describe("target drift", () => {
  it("flags holdings 3+ points from target, including targets not held", () => {
    const d = driftOf([{ symbol: "A", weight: 0.6 }, { symbol: "B", weight: 0.4 }], { A: 0.5, B: 0.39, C: 0.11 })!;
    expect(d.map((x) => [x.symbol, x.flag])).toEqual([["C", true], ["A", true], ["B", false]]);
    expect(driftOf([{ symbol: "A", weight: 1 }], {})).toBeNull();
  });
});
