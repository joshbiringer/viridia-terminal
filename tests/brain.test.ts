import { describe, expect, it } from "vitest";
import { brainSignal, labelFor, technicalComponent, thesisComponent, thesisUniverse, thesisWeight, valueComponent, type MarketRow, type Thesis } from "../src/lib/brain/signal";

const NOW = new Date("2026-11-09T12:00:00Z");
const thesis = (o: Partial<Thesis> = {}): Thesis => ({
  id: "t1", title: "Energy reclaims index share", stance: "bullish", conviction: 4, horizon: "year", status: "active", style: "macro",
  thesis: "x", invalidation: null, tags: [], created_at: "2026-11-08T00:00:00Z", expires_on: null, source: null,
  links: [{ kind: "symbol", value: "XLE", stance: null, weight: 1 }], ...o,
});
const mkt = (o: Partial<MarketRow> = {}): MarketRow => ({
  symbol: "XLE", name: "Energy", asset_subtype: "etf", sector: null, close: 90, last_ts: "2026-11-06T00:00:00Z", trend: "uptrend",
  vs_sma50: 0.02, vs_sma200: 0.08, from_high: -0.05, dollar_volume: 1e9, glance_pattern: "impulse", glance_complete: false,
  glance_wave: "3", glance_wave_dir: "up", glance_score: 70, glance_hold: 80, ...o,
});

describe("thesis weight", () => {
  it("scales with conviction and halves while watching", () => {
    expect(thesisWeight(thesis(), NOW)).toBeCloseTo(0.8);
    expect(thesisWeight(thesis({ status: "watching" }), NOW)).toBeCloseTo(0.4);
  });
  it("is zero when retired, invalidated or expired, and fades past the horizon", () => {
    expect(thesisWeight(thesis({ status: "invalidated" }), NOW)).toBe(0);
    expect(thesisWeight(thesis({ expires_on: "2026-11-01" }), NOW)).toBe(0);
    expect(thesisWeight(thesis({ horizon: "weeks", created_at: "2026-08-01T00:00:00Z" }), NOW)).toBeLessThan(0.8);
  });
});

describe("thesis component", () => {
  it("applies a link's own stance (pair trades) and flags conflicts", () => {
    const pair = thesis({ links: [{ kind: "symbol", value: "XLE", stance: null, weight: 1 }, { kind: "symbol", value: "XLK", stance: "bearish", weight: 1 }] });
    expect(thesisComponent({ symbol: "XLK", sector: null }, [pair], NOW).component!.score).toBeLessThan(0);
    const other = thesis({ id: "t2", title: "Energy is a value trap", stance: "bearish", conviction: 3 });
    const r = thesisComponent({ symbol: "XLE", sector: null }, [thesis(), other], NOW);
    expect(r.conflict).toBe(true);
    expect(r.component!.score).toBeGreaterThan(0);
  });
  it("reaches a sector ETF through a sector link", () => {
    const sec = thesis({ links: [{ kind: "sector", value: "Financials", stance: "bearish", weight: 1 }] });
    expect(thesisComponent({ symbol: "XLF", sector: null }, [sec], NOW).component!.score).toBeLessThan(0);
    expect(thesisUniverse([sec])).toEqual(["XLF"]);
  });
  it("is null when no thesis touches the security", () => {
    expect(thesisComponent({ symbol: "AAPL", sector: null }, [thesis()], NOW).component).toBeNull();
  });
});

describe("value and technical components", () => {
  it("rewards a stock cheaper than its sector with a strong free-cash-flow yield", () => {
    const v = valueComponent({ pe: 8, sectorPe: 16, fcfYield: 0.09, opMargin: 0.2, sectorOpMargin: 0.15 })!;
    expect(v.score).toBeGreaterThan(0.6);
    expect(v.reasons[0]).toMatch(/P\/E|Free-cash-flow/);
  });
  it("penalizes an expensive one and returns null without inputs", () => {
    expect(valueComponent({ pe: 60, sectorPe: 18, fcfYield: 0.01 })!.score).toBeLessThan(-0.5);
    expect(valueComponent({})).toBeNull();
    expect(valueComponent(null)).toBeNull();
  });
  it("reads trend, the 200-day and the next expected wave", () => {
    expect(technicalComponent(mkt())!.score).toBeGreaterThan(0.6);
    expect(technicalComponent(mkt({ trend: "downtrend", vs_sma200: -0.1, glance_wave_dir: "down" }))!.score).toBeLessThan(-0.6);
    expect(technicalComponent(mkt({ close: null }))).toBeNull();
  });
});

describe("brain signal", () => {
  it("averages equal thirds and gives an ETF no value score", () => {
    const s = brainSignal(mkt(), [thesis()], { pe: 5, sectorPe: 20 }, NOW);
    expect(s.value).toBeNull();
    expect(s.components).toBe(2);
    expect(s.label).toBe("Buy");
  });
  it("can't reach Buy or Sell on one component", () => {
    expect(labelFor(0.9, 1)).toBe("Accumulate");
    expect(labelFor(-0.9, 1)).toBe("Reduce");
    expect(labelFor(0, 3)).toBe("Hold");
  });
  it("lets value pull a stock's signal", () => {
    const stock = mkt({ symbol: "XOM", asset_subtype: "common", trend: "mixed", vs_sma200: 0, glance_wave_dir: null });
    const cheap = brainSignal(stock, [], { pe: 7, sectorPe: 14, fcfYield: 0.1 }, NOW);
    const dear = brainSignal(stock, [], { pe: 40, sectorPe: 14, fcfYield: 0.01 }, NOW);
    expect(cheap.score).toBeGreaterThan(dear.score);
  });
});
