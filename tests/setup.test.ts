import { describe, expect, it } from "vitest";
import type { CompactCandidate, CompactCandidateSet } from "../supabase/functions/_shared/engine/candidates";
import type { ConfluenceZone } from "../supabase/functions/_shared/engine/fib";
import { setupOf, setupVerdict } from "../supabase/functions/_shared/engine/setup";

const cand = (o: Partial<CompactCandidate> & Pick<CompactCandidate, "pt" | "d" | "c" | "p" | "nx">): CompactCandidate => ({
  id: "x", st: null, inv: null, ev: [0, 0, 0, 0], sc: 72, rk: [5, 6], ...o,
});
const set = (...c: CompactCandidate[]): CompactCandidateSet => ({ v: "t", a: null, x: 0, e: 0, eb: [], t: false, c });
const P = (...prices: number[]): [string, number][] => prices.map((p, i) => [`2026-01-${String(i + 1).padStart(2, "0")}`, p]);

describe("Wave setups", () => {
  it("turns a wave 3 in progress into a buy at the close with the wave 1 origin as stop", () => {
    const c = cand({
      pt: "impulse", d: "u", c: false, p: P(100, 120, 108),
      nx: { l: "3", d: "u", h: 100, hs: "below", hr: "Wave 1 origin" },
      tg: [[140.36, "Wave 3 = 161.8% of wave 1", true], [128, "Wave 3 = 100% of wave 1", false]],
    });
    const s = setupOf(set(c), "intermediate", 115, [])!;
    expect(s.kind).toBe("wave3");
    expect(s.side).toBe("buy");
    expect(s.status).toBe("active");
    expect(s.stop.price).toBe(100);
    expect(s.stop.rule).toBe(true);
    expect(s.target.price).toBe(140.36);
    expect(s.rr).toBeCloseTo((140.36 - 115) / 15, 2);
    expect(s.riskPct).toBeCloseTo(15 / 115, 4);
  });

  it("waits for a wave 2 pullback at 61.8% and projects wave 3 from the entry", () => {
    const c = cand({
      pt: "impulse", d: "u", c: false, p: P(100, 120),
      nx: { l: "2", d: "d", h: 100, hs: "below", hr: "Wave 1 origin" },
    });
    const s = setupOf(set(c), "minor", 118, [])!;
    expect(s.kind).toBe("pullback2");
    expect(s.status).toBe("waiting");
    expect(s.side).toBe("buy");
    expect(s.entry.low).toBeCloseTo(120 - 0.618 * 20, 4);
    expect(s.target.price).toBeCloseTo(s.entry.low + 1.618 * 20, 4);
  });

  it("uses a confluence zone as the entry range when the level falls inside one", () => {
    const c = cand({ pt: "impulse", d: "u", c: false, p: P(100, 120), nx: { l: "2", d: "d", h: 100, hs: "below", hr: null } });
    const zone = { low: 107, high: 109, mid: 108, strength: 5, count: 3, degrees: ["minor"], side: "below", distancePct: -0.1, levels: [] } as ConfluenceZone;
    const s = setupOf(set(c), "minor", 118, [zone])!;
    expect(s.entry).toMatchObject({ low: 107, high: 109, zoneCount: 3 });
  });

  it("drops a waiting setup once price is already through the entry", () => {
    const c = cand({ pt: "impulse", d: "u", c: false, p: P(100, 120), nx: { l: "2", d: "d", h: 100, hs: "below", hr: null } });
    expect(setupOf(set(c), "minor", 105, [])).toBeNull();
  });

  it("gives no setup without a stop, or when the target is already reached", () => {
    const noStop = cand({ pt: "impulse", d: "u", c: false, p: P(100, 120, 108), nx: { l: "3", d: "u", h: null, hs: null, hr: null }, tg: [[140, "t", true]] });
    expect(setupOf(set(noStop), "minor", 115, [])).toBeNull();
    const reached = cand({ pt: "impulse", d: "u", c: false, p: P(100, 120, 108), nx: { l: "3", d: "u", h: 100, hs: "below", hr: null }, tg: [[140, "t", true]] });
    expect(setupOf(set(reached), "minor", 141, [])).toBeNull();
  });

  it("sells after five waves up, stop at the wave 5 high, target at wave 4", () => {
    const c = cand({ pt: "impulse", d: "u", c: true, p: P(100, 120, 110, 150, 140, 160), nx: { l: "next", d: "d", h: null, hs: null, hr: null } });
    const s = setupOf(set(c), "primary", 155, [])!;
    expect(s).toMatchObject({ kind: "after_impulse", side: "sell", status: "active" });
    expect(s.stop).toMatchObject({ price: 160, rule: false });
    expect(s.target.price).toBe(140);
  });

  it("rejects a setup whose target is closer than its stop, and says why", () => {
    const c = cand({ pt: "impulse", d: "u", c: false, p: P(100, 120, 108), nx: { l: "3", d: "u", h: 100, hs: "below", hr: null }, tg: [[140, "t", true]] });
    const v = setupVerdict(set(c), "minor", 125, []); // risk 25, reward 15
    expect(v.setup).toBeNull();
    expect(v.reason).toMatch(/closer than the stop/);
  });

  it("offers no pullback entry for a diagonal's wave 4", () => {
    const c = cand({ pt: "ending_diagonal", d: "u", c: false, p: P(100, 130, 110, 135), nx: { l: "4", d: "d", h: 110, hs: "below", hr: null } });
    const v = setupVerdict(set(c), "minor", 134, []);
    expect(v.setup).toBeNull();
    expect(v.reason).toMatch(/diagonal/);
  });

  it("flags wave 5 as late in the trend and marks close calls", () => {
    const pref = cand({ id: "a", pt: "impulse", d: "u", c: false, p: P(100, 120, 110, 150, 140), nx: { l: "5", d: "u", h: 120, hs: "below", hr: null }, tg: [[160, "Wave 5 = wave 1", true]], sc: 70 });
    const alt = cand({ id: "b", pt: "zigzag", d: "u", c: false, p: P(110, 150, 140), nx: { l: "C", d: "u", h: 110, hs: "below", hr: null }, sc: 68 });
    const s = setupOf(set(pref, alt), "intermediate", 135, [])!;
    expect(s.kind).toBe("wave5");
    expect(s.closeCall).toBe(true);
    expect(s.cautions.some((x) => x.startsWith("Late in the trend"))).toBe(true);
  });
});
