import { describe, expect, it } from "vitest";
import { parseHoldings, xray, type Context } from "../src/lib/portfolio/xray";
import { compareReview, nearLongTerm, snapshotOf, talkingPoints } from "../src/lib/portfolio/review";

const ctx = (symbol: string, close: number, dir = "up", sub = "common"): Context => ({
  symbol, name: symbol, asset_subtype: sub, close, prev_close: close, trend: "uptrend", glance_pattern: "impulse", glance_complete: false,
  glance_wave: "3", glance_wave_dir: dir, glance_score: 70, glance_hold: null, setup_side: null, setup_kind: null, setup_rr: null, weekly_dir: "up",
});
const closes = (f: (i: number) => number) => Array.from({ length: 253 }, (_, i) => ({ ts: new Date(Date.UTC(2025, 0, 1) + i * 864e5).toISOString(), close: f(i) }));
const m = new Map([["AAA", closes((i) => 100 + i * 0.1)], ["BBB", closes((i) => 100 + Math.sin(i))], ["SPY", closes((i) => 100 + i * 0.05)]]);

describe("meeting prep", () => {
  const { holdings } = parseHoldings("AAA,30,50,2025-11-20\nBBB,10,150");
  const today = new Date("2026-09-29T12:00:00Z");
  const before = xray(holdings, [ctx("AAA", 100), ctx("BBB", 100)], m, today);
  const after = xray(holdings, [ctx("AAA", 120, "down"), ctx("BBB", 100)], m, today);

  it("compares with the last review: value, movers and count flips", () => {
    const d = compareReview(after, snapshotOf(before, new Date("2026-06-01T12:00:00Z")))!;
    expect(d.valueChange).toBe(600);
    expect(d.priceMoves[0]).toMatchObject({ symbol: "AAA" });
    expect(d.structureFlips).toEqual([{ symbol: "AAA", from: "up", to: "down" }]);
    expect(compareReview(after, null)).toBeNull();
  });
  it("keeps Elliott terms out of the client version and always adds the note", () => {
    const d = compareReview(after, snapshotOf(before, new Date("2026-06-01T12:00:00Z")));
    const client = talkingPoints(after, d, "client").map((p) => p.text).join(" ");
    expect(client).not.toMatch(/wave|count|impulse|invalidation|Fibonacci|beta/i);
    expect(client).toMatch(/not a recommendation/);
    const adv = talkingPoints(after, d, "advisor").map((p) => p.text).join(" ");
    expect(adv).toMatch(/Preferred count changed direction for AAA/);
    expect(adv).toMatch(/Loss candidates: BBB/);
  });
  it("finds gains close to becoming long-term", () => {
    expect(nearLongTerm(after, holdings, today).map((p) => p.symbol)).toEqual(["AAA"]);
  });
});
