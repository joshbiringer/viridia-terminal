import { describe, expect, it } from "vitest";
import { changeSentence, closeLabel, regime, returns, routeCommand, tickersIn, whatChanged, type PulseRow } from "../src/lib/analysis/mission";
import type { Breadth } from "../src/lib/market-data/snapshot";

const breadth = (p: Partial<Breadth>): Breadth => ({
  universe: 4000, measured: 1000, uptrend: 300, mixed: 400, downtrend: 300, insufficient: 0, above_sma50: 500, measured_50: 1000,
  above_sma200: 500, near_52w_high: 50, near_52w_low: 50, advancers: 500, decliners: 500, as_of: null, refreshed_at: null, ...p,
});
const row = (symbol: string, close: number, prev: number, c5: number, c21: number, trend: PulseRow["trend"] = "uptrend"): PulseRow => ({
  symbol, name: symbol, close, prev_close: prev, close_5: c5, close_21: c21, trend, last_ts: "2026-09-25T00:00:00+00:00", spark: [],
  glance_pattern: null, glance_complete: null, glance_wave: null, glance_wave_dir: null, glance_score: null, setup_side: null, setup_kind: null, setup_status: null,
});

describe("Ask Viridia command routing", () => {
  it("routes the suggested prompts", () => {
    expect(routeCommand("Explain today's market").kind).toBe("market");
    expect(routeCommand("Find improving structures").kind).toBe("improving");
    expect(routeCommand("Compare NVDA and AMD")).toEqual({ kind: "compare", symbols: ["NVDA", "AMD"] });
    expect(routeCommand("Show watchlist changes").kind).toBe("watchlist");
  });
  it("finds tickers typed in lowercase after compare, and a single ticker", () => {
    expect(routeCommand("compare nvda vs amd")).toEqual({ kind: "compare", symbols: ["NVDA", "AMD"] });
    expect(routeCommand("What about $TSLA?")).toEqual({ kind: "ticker", symbol: "TSLA" });
    expect(tickersIn("Explain today's market")).toEqual([]);
    expect(routeCommand("tell me a joke").kind).toBe("unknown");
  });
});

describe("market regime", () => {
  it("classifies breadth and flags narrow participation", () => {
    const up = regime(breadth({ uptrend: 600, downtrend: 150, above_sma50: 620 }));
    expect(up.id).toBe("broad_up");
    const narrow = regime(breadth({ uptrend: 420, downtrend: 300, above_sma50: 450 }), row("SPY", 1, 1, 1, 1, "uptrend"));
    expect(narrow.id).toBe("leaning_up");
    expect(narrow.sentence).toMatch(/narrower/);
    expect(regime(null).id).toBe("unknown");
  });
});

describe("what changed feed", () => {
  it("leads with the tape and never exceeds eight items", () => {
    const pulse = [row("SPY", 101, 100, 99, 95), row("IWM", 100, 100, 104, 100), row("TLT", 90, 91, 93, 95), row("USO", 110, 108, 100, 100), row("GLD", 100, 100, 100, 100)];
    const feed = whatChanged({
      pulse, breadth: breadth({ advancers: 2100, decliners: 1400 }),
      market: Array.from({ length: 5 }, (_, i) => ({ symbol: `S${i}`, text: "x", tone: "neutral" as const })), watchlist: [],
      gainer: { symbol: "G", name: "Gco", change_pct: 0.12 }, loser: { symbol: "L", name: "Lco", change_pct: -0.09 },
    });
    expect(feed[0].kind).toBe("market");
    expect(feed.length).toBeLessThanOrEqual(8);
    expect(feed.some((f) => f.kind === "rates" && /yields rising/.test(f.text))).toBe(true);
    expect(feed.some((f) => f.kind === "macro" && f.symbol === "USO")).toBe(true);
    expect(feed.some((f) => /Small caps lagged/.test(f.text))).toBe(true);
  });
  it("computes 1D, 1W and 1M returns", () => {
    const r = returns({ close: 110, prev_close: 100, close_5: 110, close_21: null });
    expect(r.d1).toBeCloseTo(0.1);
    expect(r.w1).toBe(0);
    expect(r.m1).toBeNull();
  });
});

describe("change sentences and close labels", () => {
  it("prefers a new setup, then a direction flip", () => {
    const base = { symbol: "X", pattern: "impulse", complete: false, wave: "3", wave_dir: "up", score: 70, setup_side: "buy", setup_kind: "wave3",
      p_pattern: "zigzag", p_complete: true, p_wave: "C", p_wave_dir: "down", p_score: 60, p_setup_side: null, p_setup_kind: null,
      direction_flip: true, pattern_change: true, setup_new: true, setup_gone: false, confidence_move: true };
    expect(changeSentence(base).text).toMatch(/^New buy setup/);
    expect(changeSentence({ ...base, setup_new: false }).text).toMatch(/turned up/);
    expect(changeSentence({ ...base, setup_new: false }).improving).toBe(true);
  });
  it("names the session of the last bar", () => {
    const monday = new Date("2026-09-28T14:00:00Z");
    expect(closeLabel("2026-09-25T00:00:00+00:00", monday)).toBe("Friday's close");
    expect(closeLabel("2026-09-28T00:00:00+00:00", new Date("2026-09-28T22:00:00Z"))).toBe("today's close");
    expect(closeLabel("2026-09-28T00:00:00+00:00", new Date("2026-09-29T14:00:00Z"))).toBe("yesterday's close");
  });
});

import { viridiaChanges, type StructureEvent } from "../src/lib/analysis/events";
import { portfolioIntel } from "../src/lib/portfolio/intel";

const ev = (symbol: string, type: StructureEvent["type"], weight = 1, detail: Record<string, unknown> = {}): StructureEvent =>
  ({ symbol, name: symbol, day: "2026-09-25", type, weight, detail, close: 10, change_pct: 0, adv20: 1e8 });

describe("Viridia changes", () => {
  it("orders groups structure, count, new Fib, Fib entry, invalidation, alignment and puts watchlist names first", () => {
    const g = viridiaChanges(
      [ev("AAA", "COUNT_INVALIDATED", 3, { count: "Impulse", close: 9, level: 9.5 }), ev("BBB", "FIB_ZONE_ENTERED", 1, { low: 9, high: 11 }), ev("CCC", "TREND_CHANGED", 2, { from: "mixed", to: "uptrend" }), ev("DDD", "TREND_CHANGED", 3, { from: "mixed", to: "downtrend" })],
      [{ type: "TREND_CHANGED", n: 40 }, { type: "COUNT_INVALIDATED", n: 5 }], ["CCC"],
    );
    expect(g.map((x) => x.id)).toEqual(["structure", "fib_in", "invalidation"]);
    expect(g[0].n).toBe(40);
    expect(g[0].examples[0].symbol).toBe("CCC");
    expect(g[1].n).toBe(1); // no count row, but an example exists
  });
});

describe("Portfolio intelligence", () => {
  const ctx = (symbol: string, close: number | null, prev: number | null, hold: number | null = null) =>
    ({ symbol, name: symbol, asset_subtype: "stock", close, prev_close: prev, trend: null, glance_pattern: null, glance_complete: null, glance_wave: null, glance_wave_dir: null, glance_score: null, glance_hold: hold, setup_side: null, setup_kind: null, setup_rr: null, weekly_dir: null });
  it("measures value, day move, exposure and contributors only from priced holdings", () => {
    const p = portfolioIntel(
      [{ symbol: "A", shares: 10, avgCost: null, acquired: null }, { symbol: "B", shares: 5, avgCost: null, acquired: null }],
      [ctx("A", 100, 90, 98), ctx("B", 50, 55)],
      [ev("A", "FIB_ZONE_ENTERED"), ev("B", "TREND_CHANGED", 2, { from: "uptrend", to: "mixed" }), ev("Z", "TREND_CHANGED")],
    );
    expect(p.value).toBe(1250);
    expect(p.dayMove).toBe(100 - 25);
    expect(p.dayPct).toBeCloseTo(75 / 1175, 6);
    expect(p.largest).toEqual({ symbol: "A", weight: 0.8 });
    expect(p.contributor?.symbol).toBe("A");
    expect(p.detractor?.symbol).toBe("B");
    expect(p.nearInvalidation).toEqual(["A"]);
    expect(p.fibEvents).toEqual(["A"]);
    expect(p.structural.map((s) => s.symbol)).toEqual(["B"]);
  });
  it("gives no day move when a priced holding lacks a prior close", () => {
    const p = portfolioIntel([{ symbol: "A", shares: 1, avgCost: null, acquired: null }], [ctx("A", 10, null)], []);
    expect(p.dayMove).toBeNull();
    expect(p.contributor).toBeNull();
  });
});
