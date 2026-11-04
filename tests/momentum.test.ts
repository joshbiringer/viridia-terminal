import { describe, expect, it } from "vitest";
import {
  analyzeMomentum, ema, macd, swingPivots, wilderRsi, type MBar,
} from "../supabase/functions/_shared/engine/momentum";

// StockCharts' worked Wilder RSI example (14 periods): closes and the published RSI from the 15th close.
const SC_CLOSES = [44.3389, 44.0902, 44.1497, 43.6124, 44.3278, 44.8264, 45.0955, 45.4245, 45.8433, 46.0826, 45.8931, 46.0328, 45.614, 46.282, 46.282,
  46.0028, 46.0328, 46.4116, 46.2222, 45.6439, 46.2122, 46.2521, 45.7137, 46.4515, 45.7835, 45.3548, 44.0288, 44.1783, 44.2181, 44.5672, 43.4205, 42.6628, 43.1314];
const SC_RSI = [70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38, 54.71, 50.42, 39.99, 41.46, 41.87, 45.46, 37.30, 33.08, 37.77];

/** Bars along straight legs between waypoints, `per` bars per leg, with a small high/low range. */
function path(way: number[], per = 10, t0 = Date.parse("2024-01-01T00:00:00Z")): MBar[] {
  const out: MBar[] = [];
  let prev = way[0];
  const push = (c: number) => {
    const i = out.length;
    out.push({ ts: new Date(t0 + i * 86_400_000).toISOString(), open: prev, high: Math.max(prev, c) * 1.002, low: Math.min(prev, c) * 0.998, close: c, volume: 1e6 });
    prev = c;
  };
  push(way[0]);
  for (let w = 1; w < way.length; w++) {
    const a = way[w - 1], b = way[w], k = Array.isArray(per) ? per[w - 1] : per;
    for (let s = 1; s <= k; s++) push(a + ((b - a) * s) / k);
  }
  return out;
}
/** Same, with a bar count per leg. */
function legs(way: number[], per: number[]): MBar[] {
  const out: MBar[] = [];
  const t0 = Date.parse("2024-01-01T00:00:00Z");
  let prev = way[0];
  const push = (c: number) => {
    const i = out.length;
    out.push({ ts: new Date(t0 + i * 86_400_000).toISOString(), open: prev, high: Math.max(prev, c) * 1.002, low: Math.min(prev, c) * 0.998, close: c, volume: 1e6 });
    prev = c;
  };
  push(way[0]);
  for (let w = 1; w < way.length; w++) for (let s = 1; s <= per[w - 1]; s++) push(way[w - 1] + ((way[w] - way[w - 1]) * s) / per[w - 1]);
  return out;
}

describe("RSI (Wilder)", () => {
  const rsi = wilderRsi(SC_CLOSES, 14);
  it("matches the published StockCharts example", () => {
    SC_RSI.forEach((v, k) => expect(rsi[14 + k]!).toBeCloseTo(v, 1));
  });
  it("is null until 14 changes exist", () => {
    expect(rsi.slice(0, 14).every((v) => v === null)).toBe(true);
    expect(wilderRsi([1, 2, 3], 14).every((v) => v === null)).toBe(true);
  });
  it("is 100 when there are no losses and 50 on a flat series", () => {
    expect(wilderRsi(Array.from({ length: 20 }, (_, i) => i), 14)[19]).toBe(100);
    expect(wilderRsi(Array(20).fill(5), 14)[19]).toBe(50);
  });
});

describe("EMA and MACD", () => {
  it("seeds the EMA with a simple mean", () => {
    const e = ema([1, 2, 3, 4, 5, 6], 3);
    expect(e[1]).toBeNull();
    expect(e[2]).toBe(2);
    expect(e[3]).toBeCloseTo(3, 10); // 4·0.5 + 2·0.5
  });
  it("gives exactly 7 × slope on a straight line (EMA lag (n−1)/2: 12.5 − 5.5)", () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + 2 * i);
    const m = macd(closes);
    expect(m.macd[24]).toBeNull();
    expect(m.macd[25]).toBeCloseTo(14, 9);
    expect(m.macd[79]).toBeCloseTo(14, 9);
    expect(m.signal[32]).toBeNull();
    expect(m.signal[33]).toBeCloseTo(14, 9);
    expect(m.hist[60]).toBeCloseTo(0, 9);
  });
  it("matches an independent step-by-step computation on real-looking data", () => {
    const closes = SC_CLOSES.concat(SC_CLOSES.map((c, i) => c + Math.sin(i) * 0.7));
    const ref = (n: number) => {
      const out: (number | null)[] = closes.map(() => null);
      let e = closes.slice(0, n).reduce((a, b) => a + b, 0) / n;
      out[n - 1] = e;
      for (let i = n; i < closes.length; i++) { e = (closes[i] - e) * (2 / (n + 1)) + e; out[i] = e; }
      return out;
    };
    const f = ref(12), s = ref(26), m = macd(closes);
    for (let i = 25; i < closes.length; i++) expect(m.macd[i]!).toBeCloseTo(f[i]! - s[i]!, 9);
  });
});

describe("swing pivots", () => {
  it("confirms a pivot only after the right-side bars close", () => {
    const bars = path([100, 120, 100], 10);
    const piv = swingPivots(bars, 5, 5);
    const high = piv.find((p) => p.type === "high")!;
    expect(high.index).toBe(10);
    expect(high.confirmedIndex).toBe(15);
    // with only 4 bars after the peak, it isn't a pivot yet
    expect(swingPivots(bars.slice(0, 15), 5, 5).some((p) => p.type === "high")).toBe(false);
  });
});

describe("divergences", () => {
  const find = (bars: MBar[], type: string, ind = "rsi") => analyzeMomentum(bars).divergences.find((d) => d.type === type && d.indicator === ind);

  it("detects a regular bullish divergence: lower price low, higher RSI low", () => {
    // sharp drop to 100, bounce, then a slow grind to a slightly lower low
    const bars = legs([150, 140, 100, 112, 97, 115], [10, 6, 8, 25, 10]);
    const d = find(bars, "regular_bullish");
    expect(d).toBeDefined();
    expect(d!.second.price).toBeLessThan(d!.first.price);
    expect(d!.second.value).toBeGreaterThan(d!.first.value);
    expect(d!.confirmedIndex).toBe(d!.second.index + 5);
  });

  it("detects a regular bearish divergence: higher price high, lower RSI high", () => {
    const bars = legs([50, 60, 100, 88, 103, 85], [10, 6, 8, 25, 10]);
    const d = find(bars, "regular_bearish");
    expect(d).toBeDefined();
    expect(d!.second.price).toBeGreaterThan(d!.first.price);
    expect(d!.second.value).toBeLessThan(d!.first.value);
  });

  // an uptrend, a gentle choppy pullback, a new high, then a sharp drop that holds above the first low
  const HB_WAY = [80, 120, 116, 118, 114, 116, 112, 114, 108, 132, 112, 135];
  const HB_PER = [20, 2, 2, 2, 2, 2, 2, 2, 8, 3, 10];

  it("detects a hidden bullish divergence: higher price low, lower RSI low", () => {
    const d = find(legs(HB_WAY, HB_PER), "hidden_bullish");
    expect(d).toBeDefined();
    expect(d!.second.price).toBeGreaterThan(d!.first.price);
    expect(d!.second.value).toBeLessThan(d!.first.value);
  });

  it("detects a hidden bearish divergence: lower price high, higher RSI high", () => {
    const d = find(legs(HB_WAY.map((x) => 200 - x), HB_PER), "hidden_bearish");
    expect(d).toBeDefined();
    expect(d!.second.price).toBeLessThan(d!.first.price);
    expect(d!.second.value).toBeGreaterThan(d!.first.value);
  });

  it("checks MACD independently of RSI", () => {
    const bars = legs([150, 140, 100, 112, 97, 115], [30, 6, 8, 25, 10]);
    const all = analyzeMomentum(bars).divergences;
    expect(all.some((d) => d.indicator === "macd" && d.type === "regular_bullish")).toBe(true);
  });

  it("ignores pivots too far apart", () => {
    const bars = legs([150, 140, 100, 112, 97, 115], [10, 6, 40, 40, 10]);
    expect(analyzeMomentum(bars, { maxSeparation: 60 }).divergences.filter((d) => d.type === "regular_bullish")).toHaveLength(0);
  });

  it("reports each divergence once", () => {
    const ds = analyzeMomentum(legs([150, 140, 100, 112, 97, 115], [10, 6, 8, 25, 10])).divergences;
    expect(new Set(ds.map((d) => d.id)).size).toBe(ds.length);
  });
});

describe("crossovers and states", () => {
  it("detects MACD signal and zero crossings and RSI level crossings", () => {
    const r = analyzeMomentum(legs([100, 60, 140], [40, 40]));
    const kinds = new Set(r.crossovers.map((c) => c.kind));
    for (const k of ["macd_signal_up", "macd_zero_up", "rsi_30_up", "rsi_50_up", "rsi_70_up"]) expect(kinds.has(k as never)).toBe(true);
    const up = r.crossovers.find((c) => c.kind === "macd_signal_up")!;
    expect(r.series.macd[up.index - 1]!).toBeLessThanOrEqual(r.series.signal[up.index - 1]!);
    expect(r.series.macd[up.index]!).toBeGreaterThan(r.series.signal[up.index]!);
  });

  it("marks events on a still-forming bar as developing", () => {
    const bars = legs([100, 60, 140], [40, 40]);
    const r = analyzeMomentum(bars, { lastBarOpen: true });
    expect(r.crossovers.filter((c) => c.status === "developing").every((c) => c.index === bars.length - 1)).toBe(true);
  });

  it("reports oversold and overbought states", () => {
    expect(analyzeMomentum(legs([100, 60], [40])).state.rsiState).toBe("oversold");
    expect(analyzeMomentum(legs([60, 100], [40])).state.rsiState).toBe("overbought");
  });

  it("handles short histories without inventing values", () => {
    const r = analyzeMomentum(legs([100, 101], [8]));
    expect(r.state.rsi).toBeNull();
    expect(r.state.macd).toBeNull();
    expect(r.state.rsiState).toBe("unavailable");
    expect(r.divergences).toEqual([]);
  });
});

describe("non-repainting", () => {
  it("replaying any prefix reproduces exactly the confirmed events known by then", () => {
    const bars = legs([150, 140, 100, 112, 97, 115, 104, 130, 118, 140, 120, 150], [10, 6, 8, 25, 10, 12, 9, 15, 11, 14, 9]);
    const full = analyzeMomentum(bars);
    for (const k of [40, 60, 75, 90, 110, bars.length - 1]) {
      const part = analyzeMomentum(bars.slice(0, k + 1));
      const known = (xs: { confirmedIndex?: number; index?: number; id: string; status?: string }[], at: (x: never) => number) =>
        xs.filter((x) => at(x as never) <= k).map((x) => x.id).sort();
      expect(part.divergences.map((d) => d.id).sort()).toEqual(known(full.divergences, (d: { confirmedIndex: number }) => d.confirmedIndex));
      expect(part.crossovers.map((c) => c.id).sort()).toEqual(known(full.crossovers, (c: { index: number }) => c.index));
      // indicator values never change once computed
      for (let i = 0; i <= k; i++) expect(part.series.rsi[i]).toBe(full.series.rsi[i]);
    }
  });
});
