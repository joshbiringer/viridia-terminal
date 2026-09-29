import { describe, expect, it } from "vitest";
import { eventSentence, eventTone, isImproving } from "../src/lib/analysis/events";

describe("structural event sentences", () => {
  it("describes each event type from its stored detail", () => {
    expect(eventSentence({ type: "TREND_CHANGED", detail: { from: "mixed", to: "uptrend" } })).toBe("Trend moved from mixed to uptrend.");
    expect(eventSentence({ type: "COUNT_INVALIDATED", detail: { count: "Impulse w5 ↑", level: 240, close: 238, now: "Zigzag complete ↓" } }))
      .toMatch(/Impulse w5 ↑ was invalidated: price closed at 238, beyond its 240 level/);
    expect(eventSentence({ type: "FIB_ZONE_EXITED", detail: { low: 10, high: 11, side: "above" } })).toMatch(/upside/);
    expect(eventSentence({ type: "TIMEFRAME_ALIGNMENT_CHANGED", detail: { aligned: true, daily: "up", weekly: "up" } })).toMatch(/both point up/);
  });
  it("assigns tones and 'improving' deterministically", () => {
    expect(eventTone({ type: "COUNT_ADDED", detail: { count: "Impulse w3 ↑", rank: 1 } })).toBe("pos");
    expect(eventTone({ type: "COUNT_INVALIDATED", detail: {} })).toBe("neg");
    expect(isImproving({ type: "TREND_CHANGED", detail: { from: "mixed", to: "uptrend" } })).toBe(true);
    expect(isImproving({ type: "FIB_ZONE_EXITED", detail: { side: "above" } })).toBe(false);
  });
});
