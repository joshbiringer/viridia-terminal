/**
 * Structural events (migration 0027): what changed between a security's last two analysed sessions,
 * written deterministically by the database from stored engine output. Client-safe labels and
 * sentences.
 */
export type EventType =
  | "TREND_CHANGED" | "SWING_CONFIRMED" | "STRUCTURE_CHANGED" | "COUNT_ADDED" | "COUNT_REMOVED" | "COUNT_INVALIDATED"
  | "FIB_ZONE_CREATED" | "FIB_ZONE_ENTERED" | "FIB_ZONE_EXITED" | "TIMEFRAME_ALIGNMENT_CHANGED";

export interface StructureEvent {
  symbol: string; name: string; day: string; type: EventType; weight: number;
  detail: Record<string, unknown>; close: number | null; change_pct: number | null; adv20: number | null;
}

export const EVENT_LABEL: Record<EventType, string> = {
  TREND_CHANGED: "Trend changed", SWING_CONFIRMED: "Swing confirmed", STRUCTURE_CHANGED: "Structure changed",
  COUNT_ADDED: "New leading count", COUNT_REMOVED: "Count dropped", COUNT_INVALIDATED: "Count invalidated",
  FIB_ZONE_CREATED: "New Fib zone", FIB_ZONE_ENTERED: "Entered Fib zone", FIB_ZONE_EXITED: "Left Fib zone",
  TIMEFRAME_ALIGNMENT_CHANGED: "Daily/weekly alignment",
};

export const EVENTS_METHOD =
  "Each session's analysis is compared with the previous one. Events are plain comparisons of stored engine output: the 50/200-day trend state, the latest confirmed intermediate swing, the intermediate swing structure, the top three ranked counts, the nearest Fibonacci confluence zone, and whether the daily and weekly preferred counts point the same way. No model is involved.";

const SWING: Record<string, string> = {
  higher_highs_lows: "higher highs and lows", lower_highs_lows: "lower highs and lows", expanding: "expanding", contracting: "contracting", insufficient: "not enough swings",
};
const TREND: Record<string, string> = { uptrend: "uptrend", downtrend: "downtrend", mixed: "mixed" };
const px = (v: unknown) => (typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: v >= 1 ? 2 : 4 }) : "—");

/** One plain sentence for an event. */
export function eventSentence(e: Pick<StructureEvent, "type" | "detail">): string {
  const d = e.detail as Record<string, never>;
  switch (e.type) {
    case "TREND_CHANGED": return `Trend moved from ${TREND[d.from] ?? d.from} to ${TREND[d.to] ?? d.to}.`;
    case "SWING_CONFIRMED": return `A new intermediate swing ${d.kind === "H" ? "high" : "low"} was confirmed.`;
    case "STRUCTURE_CHANGED": return `Intermediate structure changed from ${SWING[d.from] ?? d.from} to ${SWING[d.to] ?? d.to}.`;
    case "COUNT_ADDED": return Number(d.rank) === 1 ? `New leading count: ${d.count}${d.score != null ? ` (confidence ${d.score})` : ""}.` : `${d.count} entered the top three counts.`;
    case "COUNT_REMOVED": return `${d.count} is no longer among the leading counts${d.now ? `; now ${d.now}` : ""}.`;
    case "COUNT_INVALIDATED": return `${d.count} was invalidated: price closed at ${px(d.close)}, beyond its ${px(d.level)} level${d.now ? `. Now ${d.now}` : ""}.`;
    case "FIB_ZONE_CREATED": return `A new Fibonacci confluence zone formed near ${px(d.mid)}.`;
    case "FIB_ZONE_ENTERED": return `Price entered the ${px(d.low)}–${px(d.high)} confluence zone.`;
    case "FIB_ZONE_EXITED": return `Price left the ${px(d.low)}–${px(d.high)} zone to the ${d.side === "above" ? "upside" : "downside"}.`;
    case "TIMEFRAME_ALIGNMENT_CHANGED": return d.aligned ? `Daily and weekly counts now both point ${d.daily === "up" ? "up" : "down"}.` : `Daily (${d.daily}) and weekly (${d.weekly}) counts no longer agree.`;
    default: return "Structure updated.";
  }
}

/** Tone for display: constructive, defensive or neutral. */
export function eventTone(e: Pick<StructureEvent, "type" | "detail">): "pos" | "neg" | "neutral" {
  const d = e.detail as Record<string, unknown>;
  const label = String(d.count ?? d.now ?? "");
  switch (e.type) {
    case "TREND_CHANGED": return d.to === "uptrend" ? "pos" : d.to === "downtrend" ? "neg" : "neutral";
    case "STRUCTURE_CHANGED": return d.to === "higher_highs_lows" ? "pos" : d.to === "lower_highs_lows" ? "neg" : "neutral";
    case "COUNT_ADDED": return label.endsWith("↑") ? "pos" : label.endsWith("↓") ? "neg" : "neutral";
    case "COUNT_INVALIDATED": return "neg";
    case "FIB_ZONE_EXITED": return d.side === "above" ? "pos" : "neg";
    case "TIMEFRAME_ALIGNMENT_CHANGED": return d.aligned ? (d.daily === "up" ? "pos" : "neg") : "neutral";
    default: return "neutral";
  }
}

/** Improving: trend turned up, a new leading count pointing up, or daily and weekly aligning up. */
export const isImproving = (e: Pick<StructureEvent, "type" | "detail">) => eventTone(e) === "pos" && e.type !== "FIB_ZONE_EXITED";
