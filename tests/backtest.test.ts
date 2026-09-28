import { describe, expect, it } from "vitest";
import type { PivotBar } from "../supabase/functions/_shared/engine/pivots";
import { backtest, resolve, summarize } from "../supabase/functions/_shared/engine/backtest";

const bar = (i: number, low: number, high: number, close = (low + high) / 2, open = close): PivotBar =>
  ({ ts: new Date(Date.UTC(2025, 0, 1) + i * 864e5).toISOString(), open, high, low, close, volume: 1e6 });
const buyActive = { side: "buy" as const, status: "active" as const, entry: { low: 100, high: 100 }, stop: { price: 95 }, target: { price: 110 } };

describe("Setup track record", () => {
  it("counts the target when it is hit first", () => {
    const bars = [bar(0, 99, 101, 100), bar(1, 100, 104), bar(2, 103, 111)];
    expect(resolve(buyActive, bars, 0, 10)).toMatchObject({ outcome: "target", r: 2, bars: 2 });
  });
  it("counts the stop when a bar touches both (conservative)", () => {
    const bars = [bar(0, 99, 101, 100), bar(1, 94, 112)];
    expect(resolve(buyActive, bars, 0, 10)).toMatchObject({ outcome: "stop", r: -1 });
  });
  it("marks to market when neither is hit, and leaves unfinished windows pending", () => {
    const flat = [bar(0, 99, 101, 100), ...Array.from({ length: 5 }, (_, i) => bar(i + 1, 99, 103, 102))];
    expect(resolve(buyActive, flat, 0, 5)).toMatchObject({ outcome: "expired", r: 0.4 });
    expect(resolve(buyActive, flat, 0, 20).outcome).toBe("pending");
  });
  it("waiting setups must fill first, otherwise they are missed", () => {
    const wait = { ...buyActive, status: "waiting" as const, entry: { low: 98, high: 98 } };
    const missed = [bar(0, 99, 101, 100), bar(1, 100, 111)];
    expect(resolve(wait, missed, 0, 5).outcome).toBe("missed");
    const filled = [bar(0, 99, 101, 100), bar(1, 97, 99, 98, 99), bar(2, 100, 111)];
    expect(resolve(wait, filled, 0, 5)).toMatchObject({ outcome: "target", fill: 98 });
  });
  it("summarizes resolved trials only", () => {
    const s = summarize([{ outcome: "target", r: 2 }, { outcome: "stop", r: -1 }, { outcome: "pending", r: null }, { outcome: "missed", r: null }]);
    expect(s).toMatchObject({ trials: 4, resolved: 2, targets: 1, stops: 1, hitRate: 0.5, avgR: 0.5 });
  });
  it("uses only the bars up to each signal (no look-ahead)", () => {
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const bars: PivotBar[] = []; let p = 100;
    for (let i = 0; i < 400; i++) { const o = p; p *= 1 + (rnd() - 0.49) * 0.04; bars.push(bar(i, Math.min(o, p) * 0.995, Math.max(o, p) * 1.005, p, o)); }
    const full = backtest(bars, "1d");
    // changing prices after the last signal must not change any signal's levels
    const cut = full.at(-1)?.ts;
    const altered = bars.map((b) => (cut && b.ts > cut ? { ...b, high: b.high * 1.3, low: b.low * 0.7 } : b));
    const again = backtest(altered, "1d");
    expect(again.map((x) => [x.ts, x.kind, x.stop, x.target])).toEqual(full.map((x) => [x.ts, x.kind, x.stop, x.target]));
  });
});
