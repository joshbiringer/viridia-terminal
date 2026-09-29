import { describe, expect, it } from "vitest";
import { buildWorkspace, PROXY_SYMBOLS } from "../src/lib/portfolio/workspace";
import { eigenSymmetric, ols, projectSimplex, styleWeights } from "../src/lib/portfolio/linalg";
import { parseHoldings, type Context } from "../src/lib/portfolio/xray";

// deterministic pseudo-random normal draws
function rng(seed: number) {
  let s = seed >>> 0;
  const u = () => ((s = (s * 1664525 + 1013904223) >>> 0) + 0.5) / 2 ** 32;
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}
const DAYS = 400;
const dates = Array.from({ length: DAYS }, (_, i) => new Date(Date.UTC(2025, 0, 2) + i * 864e5).toISOString().slice(0, 10));
const series = (rets: number[], start = 100) => {
  let l = start;
  return [{ ts: dates[0], close: start }, ...rets.slice(1).map((r, i) => ({ ts: dates[i + 1], close: (l *= 1 + r) }))];
};
const ctx = (symbol: string, close: number, extra: Partial<Context> = {}): Context => ({
  symbol, name: symbol, asset_subtype: "common", close, prev_close: close * 0.99, trend: "uptrend", glance_pattern: "impulse", glance_complete: false,
  glance_wave: "3", glance_wave_dir: "up", glance_score: 72, glance_hold: null, setup_side: null, setup_kind: null, setup_rr: null, weekly_dir: "up", ...extra,
});

describe("linear algebra", () => {
  it("recovers OLS coefficients, eigenvalues and simplex projections", () => {
    const g = rng(1);
    const x = Array.from({ length: 300 }, () => [g(), g()]);
    const y = x.map(([a, b]) => 0.5 + 2 * a - b + 0.01 * g());
    const r = ols(y, x)!;
    expect(r.coef[1]).toBeCloseTo(2, 2);
    expect(r.coef[2]).toBeCloseTo(-1, 2);
    expect(r.r2).toBeGreaterThan(0.99);
    const e = eigenSymmetric([[2, 1], [1, 2]]);
    expect([...e.values].sort()).toEqual([expect.closeTo(1, 6), expect.closeTo(3, 6)]);
    const p = projectSimplex([0.8, 0.6, -0.2]);
    expect(p.reduce((a, v) => a + v, 0)).toBeCloseTo(1, 9);
    expect(p[2]).toBe(0);
  });
  it("style analysis finds the mix a series is built from", () => {
    const g = rng(2);
    const a = Array.from({ length: 250 }, () => g() * 0.01), b = Array.from({ length: 250 }, () => g() * 0.01), c = Array.from({ length: 250 }, () => g() * 0.01);
    const y = a.map((v, i) => 0.7 * v + 0.3 * b[i]);
    const s = styleWeights(y, a.map((v, i) => [v, b[i], c[i]]))!;
    expect(s.w[0]).toBeCloseTo(0.7, 1);
    expect(s.w[1]).toBeCloseTo(0.3, 1);
    expect(s.r2).toBeGreaterThan(0.98);
  });
});

describe("Portfolio X-Ray workspace", () => {
  const g = rng(7);
  const mkt = Array.from({ length: DAYS }, () => 0.0004 + 0.01 * g());
  const closes = new Map<string, { ts: string; close: number }[]>();
  for (const s of PROXY_SYMBOLS) closes.set(s, series(mkt.map((m) => (s === "BIL" ? 0.00015 : s === "IEF" || s === "AGG" ? 0.003 * g() : m + 0.004 * g()))));
  closes.set("SPY", series(mkt));
  const tech = Array.from({ length: DAYS }, () => 0.012 * g());
  const XLK = mkt.map((m, i) => m + tech[i]);
  closes.set("XLK", series(XLK));
  closes.set("AAA", series(XLK.map((v) => 1.3 * v + 0.006 * g())));
  closes.set("BBB", series(XLK.map((v) => 1.2 * v + 0.006 * g())));
  closes.set("CCC", series(mkt.map((m) => 0.6 * m + 0.008 * g())));
  const px = (s: string) => closes.get(s)!.at(-1)!.close;
  const { holdings } = parseHoldings(`AAA,100,${(px("AAA") * 0.8).toFixed(2)},2025-01-10\nAAA,50,${(px("AAA") * 1.2).toFixed(2)},${dates[DAYS - 20]}\nBBB,80\nCCC,200,${(px("CCC") * 1.1).toFixed(2)},2024-06-01\nUSD,5000`);
  const ws = buildWorkspace({
    holdings, closes, today: new Date(Date.parse(dates[DAYS - 1]) + 864e5),
    ctx: [ctx("AAA", px("AAA"), { glance_hold: px("AAA") * 0.98 }), ctx("BBB", px("BBB"), { trend: "downtrend", glance_pattern: "zigzag", glance_complete: true }), ctx("CCC", px("CCC"))],
    zones: [{ symbol: "AAA", zone_low: px("AAA") * 0.9, zone_high: px("AAA") * 0.95 }],
  });

  it("values the portfolio including cash, with weights summing to one", () => {
    expect(ws.positions).toHaveLength(4);
    expect(ws.positions.reduce((a, p) => a + p.weight, 0)).toBeCloseTo(1, 9);
    expect(ws.positions.find((p) => p.symbol === "USD")!.asset).toBe("cash");
    expect(ws.metrics.cash).toBeGreaterThan(0);
    expect(ws.metrics.incomeYield).toBeNull();
  });
  it("splits risk so contributions sum to one and the tech pair clusters", () => {
    const sum = ws.risk.rows.reduce((a, r) => a + (r.contribution ?? 0), 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(ws.risk.enb).toBeGreaterThan(1);
    expect(ws.correlation.clusters[0]?.symbols.sort()).toEqual(["AAA", "BBB"]);
    expect(ws.correlation.clusters[0]?.name).toMatch(/Technology/);
    expect(ws.correlation.matrix[0][0]).toBe(1);
  });
  it("estimates sector exposure from returns and factor loadings from ETF spreads", () => {
    expect(ws.positions.find((p) => p.symbol === "AAA")!.sector).toBe("Technology");
    expect(ws.factors.rows.find((f) => f.key === "market")!.loading).toBeGreaterThan(0.5);
    expect(ws.factors.rows.find((f) => f.key === "profitability")!.loading).toBeNull();
  });
  it("aggregates structure and flags value near invalidation", () => {
    expect(ws.structure.nearInvalidation.symbols).toEqual(["AAA"]);
    expect(ws.structure.trend.downtrend).toBeCloseTo(ws.positions.find((p) => p.symbol === "BBB")!.weight, 9);
    expect(ws.structure.corrective).toBeGreaterThan(0);
    expect(ws.structure.wave3).toBeGreaterThan(0);
  });
  it("tracks tax lots, terms and lots turning long-term", () => {
    expect(ws.tax!.lots).toHaveLength(3);
    expect(ws.tax!.lots.filter((l) => l.term === "short")).toHaveLength(1);
    expect(ws.tax!.turningLong30).toBe(0);
    expect(ws.tax!.lots.find((l) => l.symbol === "CCC")!.term).toBe("long");
    expect(ws.tax!.positionsWithLoss).toBe(1);
    expect(ws.tax!.gains).toBeGreaterThan(0);
  });
  it("runs historical and modeled scenarios and compares with benchmarks", () => {
    const spx = ws.stress.find((s) => s.id === "spx10")!;
    expect(spx.kind).toBe("modeled");
    expect(spx.benchmark).toBeCloseTo(-0.1, 9);
    expect(spx.portfolio).toBeLessThan(0);
    expect(ws.stress.some((s) => s.kind === "historical")).toBe(true);
    expect(ws.benchmarks.map((b) => b.id)).toEqual(["portfolio", "spy", "qqq", "6040"]);
    expect(ws.insights.length).toBeGreaterThan(3);
    expect(ws.insights.every((i) => !/NaN|undefined|Infinity/.test(i.text))).toBe(true);
  });
});

import { answer, topicOf, PORTFOLIO_QUESTIONS } from "../src/lib/portfolio/ask";
import { diffSnapshots, snapshotOfWorkspace } from "../src/lib/portfolio/snapshot";
import { parseCustomBenchmark } from "../src/lib/portfolio/workspace";

describe("Ask Viridia and snapshots", () => {
  const g = rng(11);
  const mkt = Array.from({ length: DAYS }, () => 0.0004 + 0.01 * g());
  const closes = new Map<string, { ts: string; close: number }[]>();
  for (const s of PROXY_SYMBOLS) closes.set(s, series(mkt.map((m) => (s === "BIL" ? 0.00015 : m + 0.004 * g()))));
  closes.set("SPY", series(mkt));
  closes.set("AAA", series(mkt.map((m) => 1.2 * m + 0.006 * g())));
  closes.set("BBB", series(mkt.map((m) => 0.8 * m + 0.006 * g())));
  const px = (s: string) => closes.get(s)!.at(-1)!.close;
  const build = (text: string, trendB = "uptrend") => buildWorkspace({
    holdings: parseHoldings(text).holdings, closes, zones: [],
    ctx: [ctx("AAA", px("AAA"), { glance_hold: px("AAA") * 1.02 }), ctx("BBB", px("BBB"), { trend: trendB })],
  });
  const a = build("AAA,100\nBBB,100");
  const b = build("AAA,100\nBBB,300", "downtrend");

  it("routes every suggested question to a topic and answers from workspace figures", () => {
    for (const q of PORTFOLIO_QUESTIONS) expect(topicOf(q, ["AAA", "BBB"]).topic).not.toBe("unknown");
    expect(topicOf("tell me about BBB", ["AAA", "BBB"])).toEqual({ topic: "holding", symbol: "BBB" });
    const inv = answer("Which positions are near structural invalidation?", a, null, null);
    expect(inv.lines[0]).toMatch(/AAA/);
    expect(answer("What changed since my last X-Ray?", a, null, null).lines[0]).toMatch(/no earlier snapshot/i);
    for (const q of PORTFOLIO_QUESTIONS) expect(answer(q, a, [], "Jan 1").lines.join(" ")).not.toMatch(/NaN|undefined|Infinity/);
  });
  it("lists material changes between snapshots", () => {
    const d = diffSnapshots(snapshotOfWorkspace(a), snapshotOfWorkspace(b));
    expect(d.some((c) => c.kind === "weight")).toBe(true);
    expect(d.some((c) => c.kind === "structure" && /BBB uptrend → downtrend/.test(c.text))).toBe(true);
  });
  it("reads custom benchmark weights", () => {
    expect(parseCustomBenchmark("SPY 60, AGG 40")).toEqual({ SPY: 0.6, AGG: 0.4 });
    expect(parseCustomBenchmark("spy:3 gld:1")).toEqual({ SPY: 0.75, GLD: 0.25 });
    expect(parseCustomBenchmark("nothing")).toBeNull();
  });
});
