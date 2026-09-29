import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { buildWorkspace, PROXY_SYMBOLS } from "../src/lib/portfolio/workspace";
import { parseHoldings, type Context } from "../src/lib/portfolio/xray";
import { CorrelationTab, ExposureTab, HoldingsTab, OverviewTab, RiskTab, StructureTab, TargetsBlock, TaxTab } from "../src/components/portfolio/xray/tabs";
import { AskPanel } from "../src/components/portfolio/xray/AskPanel";

function rng(seed: number) {
  let s = seed >>> 0;
  const u = () => ((s = (s * 1664525 + 1013904223) >>> 0) + 0.5) / 2 ** 32;
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}
const DAYS = 400;
const dates = Array.from({ length: DAYS }, (_, i) => new Date(Date.UTC(2025, 0, 2) + i * 864e5).toISOString().slice(0, 10));
const series = (r: number[]) => { let l = 100; return [{ ts: dates[0], close: 100 }, ...r.slice(1).map((x, i) => ({ ts: dates[i + 1], close: (l *= 1 + x) }))]; };
const ctx = (symbol: string, close: number, extra: Partial<Context> = {}): Context => ({
  symbol, name: symbol, asset_subtype: "common", close, prev_close: close * 0.99, trend: "uptrend", glance_pattern: "zigzag", glance_complete: false,
  glance_wave: "C", glance_wave_dir: "up", glance_score: 60, glance_hold: close * 0.9, setup_side: null, setup_kind: null, setup_rr: null, weekly_dir: "up", glance_degree: "intermediate", ...extra,
});

describe("X-Ray tabs render", () => {
  const g = rng(3);
  const mkt = Array.from({ length: DAYS }, () => 0.0004 + 0.01 * g());
  const closes = new Map<string, { ts: string; close: number }[]>();
  for (const s of PROXY_SYMBOLS) closes.set(s, series(mkt.map((m) => (s === "BIL" ? 0.0001 : m + 0.004 * g()))));
  for (const s of ["AAA", "BBB", "CCC"]) closes.set(s, series(mkt.map((m) => m * 1.2 + 0.008 * g())));
  const px = (s: string) => closes.get(s)!.at(-1)!.close;
  const ws = buildWorkspace({
    holdings: parseHoldings("AAA,10,50,2025-01-05\nBBB,20,200\nCCC,5\nUSD,1000").holdings, closes,
    ctx: ["AAA", "BBB", "CCC"].map((s) => ctx(s, px(s))), zones: [{ symbol: "AAA", zone_low: px("AAA") * 0.95, zone_high: px("AAA") * 0.97 }],
    benchmarks: [{ id: "custom", label: "Custom benchmark", weights: { SPY: 0.5, AGG: 0.5 } }],
  });
  const go = () => {};
  it("renders every tab and the Ask panel without throwing", () => {
    const html = [
      createElement(OverviewTab, { ws, bench: "spy", setBench: go, changes: [{ kind: "value", text: "Value +1.0%." }], since: "Jan 1", go }),
      createElement(RiskTab, { ws }), createElement(ExposureTab, { ws }), createElement(CorrelationTab, { ws }),
      createElement(StructureTab, { ws }), createElement(TaxTab, { ws }), createElement(HoldingsTab, { ws }, createElement(TargetsBlock, { ws, targets: { AAA: 0.5 }, onSave: async () => {} })),
      createElement(AskPanel, { ws, changes: null, since: null, go }),
    ].map((e) => renderToString(e)).join("");
    expect(html).toContain("Viridia portfolio insights");
    expect(html).toContain("Stress test");
    expect(html).not.toMatch(/NaN|undefined|Infinity/);
  });
});
