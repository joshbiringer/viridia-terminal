/**
 * Unified technical analysis for one symbol and timeframe: Elliott Wave counts, Fibonacci zones,
 * RSI, MACD, divergences, price action and confluence, all computed from the same bars in one pass
 * with the shared engine. The browser only draws what this returns; it never recalculates indicators.
 */
import { computeAnalysis } from "@engine/analyze";
import type { Timeframe } from "@engine/pivots";
import { DEGREES, type Degree } from "@engine/pivots";
import type { CompactCandidate } from "@engine/candidates";
import { analyzeMomentum, MOMENTUM_VERSION, type Crossover, type Divergence, type MBar, type MomentumResult } from "@engine/momentum";
import { analyzeConfluence, CONFLUENCE_VERSION, type ConfluenceResult } from "@engine/confluence";
import type { ConfluenceZone } from "@engine/fib";
import { alternateIndex } from "@engine/rank";
import { compactScenario } from "@engine/glance";

export { MOMENTUM_VERSION, CONFLUENCE_VERSION };

const LABELS: Record<string, string[]> = {
  impulse: ["1", "2", "3", "4", "5"], leading_diagonal: ["1", "2", "3", "4", "5"], ending_diagonal: ["1", "2", "3", "4", "5"],
  zigzag: ["A", "B", "C"], flat: ["A", "B", "C"], triangle: ["A", "B", "C", "D", "E"],
};

/** A wave count as the chart draws it: points with their labels (the first point is the origin). */
export interface ChartCount {
  id: string;
  pattern: string;
  subtype: string | null;
  direction: "up" | "down";
  complete: boolean;
  score: number | null;
  points: { ts: string; price: number; label: string }[];
  next: { label: string; direction: "up" | "down"; hold: number | null; holdReason: string | null };
  targets: { price: number; label: string; primary: boolean }[];
}

const toChartCount = (c: CompactCandidate): ChartCount => ({
  id: c.id, pattern: c.pt, subtype: c.st, direction: c.d === "u" ? "up" : "down", complete: c.c, score: c.sc ?? null,
  points: c.p.map(([ts, price], i) => ({ ts, price, label: i === 0 ? "" : LABELS[c.pt][i - 1] ?? "" })),
  next: { label: c.nx.l, direction: c.nx.d === "u" ? "up" : "down", hold: c.nx.h, holdReason: c.nx.hr },
  targets: (c.tg ?? []).map(([price, label, primary]) => ({ price, label, primary })),
});

const r4 = (x: number | null) => (x == null ? null : Math.round(x * 1e4) / 1e4);

export interface TechnicalPayload {
  version: string;
  timeframe: Timeframe;
  lastTs: string | null;
  lastBarOpen: boolean;
  /** Aligned with the bars array the chart already has (same order, same length). */
  series: { rsi: (number | null)[]; macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] };
  divergences: Divergence[];
  crossovers: Crossover[];
  state: MomentumResult["state"];
  params: MomentumResult["params"];
  waves: Record<Degree, { preferred: ChartCount | null; alternate: ChartCount | null }>;
  /** Fibonacci confluence zones for this timeframe. */
  zones: ConfluenceZone[];
  confluence: Record<Degree, ConfluenceResult>;
}

const BAR_MS: Partial<Record<Timeframe, number>> = { "1h": 3_600_000, "4h": 4 * 3_600_000 };

export function technicalFor(bars: MBar[], tf: Timeframe, now = Date.now()): TechnicalPayload | null {
  if (bars.length < 30) return null;
  const lastTs = bars.at(-1)!.ts;
  // an intraday bar whose period hasn't ended is still forming: events on it are "developing"
  const lastBarOpen = BAR_MS[tf] != null && now - Date.parse(lastTs) < BAR_MS[tf]!;
  const analysis = computeAnalysis(bars.map((b) => ({ ...b, volume: b.volume ?? null })), tf);
  const momentum = analyzeMomentum(bars, { lastBarOpen });
  const zones = analysis.confluence_zones_json.zones;
  const confluence = Object.fromEntries(DEGREES.map((d) => [d, analyzeConfluence({
    bars, momentum, counts: analysis.candidate_counts_json[d], zones, degree: d,
  })])) as Record<Degree, ConfluenceResult>;
  const waves = Object.fromEntries(DEGREES.map((d) => {
    const c = analysis.candidate_counts_json[d].c;
    const ai = c.length ? alternateIndex(c, compactScenario) : -1;
    return [d, { preferred: c[0] ? toChartCount(c[0]) : null, alternate: ai > 0 ? toChartCount(c[ai]) : null }];
  })) as TechnicalPayload["waves"];
  return {
    version: `${MOMENTUM_VERSION}+${CONFLUENCE_VERSION}`,
    timeframe: tf, lastTs, lastBarOpen,
    series: { rsi: momentum.series.rsi.map((v) => (v == null ? null : Math.round(v * 100) / 100)), macd: momentum.series.macd.map(r4), signal: momentum.series.signal.map(r4), hist: momentum.series.hist.map(r4) },
    divergences: [...momentum.divergences, ...momentum.developing],
    crossovers: momentum.crossovers.slice(-150),
    state: momentum.state, params: momentum.params,
    waves, zones, confluence,
  };
}
