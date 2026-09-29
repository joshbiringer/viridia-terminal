import { describe, expect, it } from "vitest";
import { beta, correlation, dailyReturns, maxDrawdown, periodReturn, volatility } from "../src/lib/analysis/stats";
import { computeSignals } from "../src/lib/analysis/signals";

const series = (f: (i: number) => number, n = 300) =>
  Array.from({ length: n }, (_, i) => ({ ts: new Date(Date.UTC(2025, 0, 1) + i * 864e5).toISOString(), close: f(i) }));

describe("price statistics", () => {
  it("measures return, drawdown and volatility", () => {
    const s = series((i) => 100 * (1 + 0.001 * i));
    expect(periodReturn(s, 100)).toBeCloseTo(s[299].close / s[199].close - 1, 10);
    expect(maxDrawdown(s, 252)).toBe(0);
    const v = series((i) => 100 * (i % 2 ? 1.01 : 1));
    expect(volatility(v, 20)!).toBeGreaterThan(0.1);
  });
  it("gives beta 2 and correlation 1 for a doubled benchmark", () => {
    let p = 100, q = 100;
    const b = series((i) => (p *= 1 + Math.sin(i) * 0.01));
    const a = series((i) => (q *= 1 + 2 * Math.sin(i) * 0.01));
    expect(beta(dailyReturns(a), dailyReturns(b))!).toBeCloseTo(2, 6);
    expect(correlation(dailyReturns(a), dailyReturns(b))!).toBeCloseTo(1, 6);
  });
});

describe("Viridia Intelligence", () => {
  it("always reports every dimension, marking missing data instead of guessing", () => {
    const d = computeSignals({ bars: [], benchmark: [], trend: null, sma50: null, sma200: null, glance: null, weekly: null });
    expect(d.map((x) => x.key)).toEqual(["structure", "wave", "fibonacci", "momentum", "regime", "risk"]);
    expect(d.every((x) => x.tone === "na")).toBe(true);
  });
  it("calls strong momentum only when ahead of the benchmark", () => {
    const up = series((i) => 100 * (1 + 0.003 * i)), flat = series(() => 100);
    const d = computeSignals({ bars: up, benchmark: flat, trend: "uptrend", sma50: 150, sma200: 140, glance: null, weekly: null });
    expect(d.find((x) => x.key === "momentum")!.state).toBe("Strong");
    expect(d.find((x) => x.key === "regime")!.state).toBe("Uptrend");
  });
});
