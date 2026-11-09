import { describe, expect, it } from "vitest";
import { buildDailyList, diff, eligible, formatDailyEmail, sectorCandidates, sectorTilt, size, type Pick } from "../src/lib/brain/portfolio";
import type { BrainSignal, MarketRow, Thesis } from "../src/lib/brain/signal";

const NOW = new Date("2026-11-09T12:00:00Z");
const row = (o: Partial<MarketRow> = {}): MarketRow => ({
  symbol: "XOM", name: "Exxon Mobil", asset_subtype: "cs", sector: "Energy", close: 110, last_ts: null, trend: "uptrend",
  vs_sma50: 0.02, vs_sma200: 0.05, from_high: -0.05, dollar_volume: 1e9, glance_pattern: null, glance_complete: null,
  glance_wave: null, glance_wave_dir: null, glance_score: null, glance_hold: 95, ...o,
});
const comp = (score: number) => ({ score, reasons: [`r${score}`] });
const sig = (o: Partial<BrainSignal> & { row?: Partial<MarketRow> } = {}): BrainSignal & { row: MarketRow } => {
  const r = row({ symbol: o.symbol ?? "XOM", ...o.row });
  return {
    symbol: r.symbol, label: "Buy", score: 0.5, components: 3, thesis: comp(0.6), value: comp(0.4), technical: comp(0.5),
    theses: [], conflict: false, ...o, row: r,
  };
};
const thesis = (o: Partial<Thesis> = {}): Thesis => ({
  id: "t", title: "Energy", stance: "bullish", conviction: 5, horizon: "year", status: "active", style: "macro", thesis: "", invalidation: null,
  tags: [], created_at: "2026-11-01T00:00:00Z", expires_on: null, source: null, links: [{ kind: "sector", value: "Energy", stance: null, weight: 1 }], ...o,
});

describe("eligibility", () => {
  it("takes Buy/Accumulate names with enough inputs and liquidity", () => {
    expect(eligible(sig(), true)).toBe(true);
    expect(eligible(sig({ label: "Hold" }), true)).toBe(false);
    expect(eligible(sig({ components: 1 }), true)).toBe(false);
    expect(eligible(sig({ row: { dollar_volume: 1e5 } }), true)).toBe(false);
  });
  it("needs the theses not against a stock and fundamentals not negative once live", () => {
    expect(eligible(sig({ thesis: comp(-0.2) }), true)).toBe(false);
    expect(eligible(sig({ value: comp(-0.3) }), true)).toBe(false);
    expect(eligible(sig({ thesis: null, value: comp(0.5) }), true)).toBe(true);
    expect(eligible(sig({ thesis: null, value: comp(0.1) }), true)).toBe(false);
  });
  it("requires a supportive thesis for ETFs and skips leveraged or inverse products", () => {
    expect(eligible(sig({ symbol: "XLE", row: { asset_subtype: "etf", name: "Energy Select Sector SPDR" } }), true)).toBe(true);
    expect(eligible(sig({ symbol: "XLE", thesis: null, row: { asset_subtype: "etf" } }), true)).toBe(false);
    expect(eligible(sig({ symbol: "ERX", row: { asset_subtype: "etf", name: "Direxion Daily Energy Bull 2X Shares" } }), true)).toBe(false);
    expect(eligible(sig({ symbol: "SPLV", row: { asset_subtype: "etf", name: "Invesco S&P 500 Low Volatility ETF" } }), true)).toBe(true);
    expect(eligible(sig({ symbol: "VGSH", row: { asset_subtype: "etf", name: "Vanguard Short-Term Treasury ETF" } }), true)).toBe(true);
  });
});

describe("sizing", () => {
  it("caps each position and leaves the remainder in cash", () => {
    const w = size([{ symbol: "A", score: 1, sector: null }, { symbol: "B", score: 1, sector: null }], 0.6, 0.05, 1);
    expect(w.get("A")).toBeCloseTo(0.05);
    expect(w.get("B")).toBeCloseTo(0.05);
  });
  it("redistributes freed weight and enforces the sector cap", () => {
    const picks = Array.from({ length: 12 }, (_, i) => ({ symbol: `S${i}`, score: i === 0 ? 5 : 1, sector: i < 8 ? "Energy" : "Health Care" }));
    const w = size(picks, 0.6, 0.05, 0.25);
    const energy = picks.filter((p) => p.sector === "Energy").reduce((a, p) => a + (w.get(p.symbol) ?? 0), 0);
    expect(energy).toBeLessThanOrEqual(0.25 + 1e-9);
    for (const v of w.values()) expect(v).toBeLessThanOrEqual(0.05 + 1e-9);
  });
});

describe("sector candidates", () => {
  it("picks cheap, profitable, large companies in favoured sectors only", () => {
    const t = [thesis(), thesis({ id: "b", stance: "bearish", links: [{ kind: "sector", value: "Information Technology", stance: null, weight: 1 }] })];
    expect(sectorTilt(t, NOW).get("Energy")).toBeGreaterThan(0.3);
    const figs = [
      { symbol: "CHEAP", sector: "Energy", market_cap: 50e9, net_income: 6e9, equity: 40e9, operating_cash_flow: 8e9, capex: 3e9 },
      { symbol: "DEAR", sector: "Energy", market_cap: 50e9, net_income: 1e9, equity: 10e9 },
      { symbol: "LOSS", sector: "Energy", market_cap: 50e9, net_income: -1e9 },
      { symbol: "TINY", sector: "Energy", market_cap: 5e8, net_income: 1e8 },
      { symbol: "TECH", sector: "Information Technology", market_cap: 50e9, net_income: 6e9 },
    ];
    expect(sectorCandidates(t, figs, NOW)).toEqual(["CHEAP", "DEAR"]);
  });
});

describe("daily list", () => {
  const p = (symbol: string, weight: number): Pick => ({ symbol, name: null, sleeve: "stock", sector: null, label: "Buy", score: 0.5, weight, close: 1, invalidation: null, thesis: null, value: null, technical: null, why: [], conflict: false });
  it("diffs against yesterday", () => {
    const ch = diff([p("A", 0.05), p("B", 0.04), p("C", 0.03)], [p("A", 0.05), p("B", 0.02), p("D", 0.04)]);
    expect(ch).toEqual([
      { symbol: "B", sleeve: "stock", kind: "trim", from: 0.04, to: 0.02 },
      { symbol: "D", sleeve: "stock", kind: "new", from: 0, to: 0.04 },
      { symbol: "C", sleeve: "stock", kind: "drop", from: 0.03, to: 0 },
    ]);
  });
  it("splits stocks and ETFs, lists today's buys and formats the email", () => {
    const signals = [
      sig({ symbol: "XOM", score: 0.6 }), sig({ symbol: "CVX", score: 0.5 }),
      sig({ symbol: "XLE", score: 0.55, value: null, row: { asset_subtype: "etf", name: "Energy Select Sector SPDR", sector: null } }),
      sig({ symbol: "NVDA", label: "Sell", score: -0.6, thesis: comp(-0.8), row: { sector: "Information Technology" } }),
    ];
    const d = buildDailyList(signals, { date: "2026-11-10", valueLive: true, now: NOW });
    expect(d.stocks.map((x) => x.symbol)).toEqual(["XOM", "CVX"]);
    expect(d.etfs.map((x) => x.symbol)).toEqual(["XLE"]);
    expect(d.buyToday).toHaveLength(3);
    expect(d.avoid[0].symbol).toBe("NVDA");
    expect(d.cash).toBeGreaterThan(0);
    const again = buildDailyList(signals, { date: "2026-11-11", valueLive: true, previous: d, now: NOW });
    expect(again.buyToday).toHaveLength(0);
    const email = formatDailyEmail(d, "https://x.test");
    expect(email).toContain("NEW XOM (stock)");
    expect(email).toContain("Nothing has been bought");
    expect(email).toContain("AVOID");
  });
});
