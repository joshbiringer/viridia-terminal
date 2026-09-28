/**
 * Mission Control (the /terminal home): the pure, client-safe pieces. Market pulse grouping and
 * returns, the market regime reading, the What Changed feed, the Ask Viridia command router and the
 * Prepare My Day brief. Every sentence is assembled from numbers Viridia already stores; nothing here
 * forecasts.
 */
import { PATTERN_LABEL, SETUP_LABEL, type CandidatePattern, type SetupKind } from "./candidates";
import type { Breadth, Trend } from "@/lib/market-data/snapshot";

export interface PulseRow {
  symbol: string; name: string; close: number | null; prev_close: number | null; close_5: number | null; close_21: number | null;
  trend: Trend | null; last_ts: string | null; spark: number[];
  glance_pattern: string | null; glance_complete: boolean | null; glance_wave: string | null; glance_wave_dir: string | null; glance_score: number | null;
  setup_side: string | null; setup_kind: string | null; setup_status: string | null;
}

export type PulseGroupId = "equities" | "rates" | "macro";
export interface PulseItem { symbol: string; label: string; hint?: string }

/** Index, yield and futures data aren't in the current data plan, so each market is shown through a liquid ETF that tracks it. */
export const PULSE_GROUPS: { id: PulseGroupId; label: string; note: string; items: PulseItem[] }[] = [
  { id: "equities", label: "Equities", note: "ETFs tracking each index", items: [
    { symbol: "SPY", label: "S&P 500" }, { symbol: "QQQ", label: "Nasdaq-100" }, { symbol: "IWM", label: "Russell 2000" }, { symbol: "DIA", label: "Dow Jones" },
  ]},
  { id: "rates", label: "Rates", note: "Treasury ETF prices, which fall when yields rise", items: [
    { symbol: "SHY", label: "2Y", hint: "1–3 year Treasuries" }, { symbol: "IEF", label: "10Y", hint: "7–10 year Treasuries" }, { symbol: "TLT", label: "30Y", hint: "20+ year Treasuries" },
  ]},
  { id: "macro", label: "Macro", note: "ETFs tracking each asset", items: [
    { symbol: "UUP", label: "Dollar" }, { symbol: "GLD", label: "Gold" }, { symbol: "USO", label: "Oil" }, { symbol: "IBIT", label: "Bitcoin" },
  ]},
];
export const PULSE_SYMBOLS = PULSE_GROUPS.flatMap((g) => g.items.map((i) => i.symbol));
export const pulseLabel = (symbol: string) => PULSE_GROUPS.flatMap((g) => g.items).find((i) => i.symbol === symbol)?.label ?? symbol;

const ret = (a: number | null | undefined, b: number | null | undefined) => (a != null && b != null && b > 0 ? a / b - 1 : null);
export const returns = (r: Pick<PulseRow, "close" | "prev_close" | "close_5" | "close_21">) => ({
  d1: ret(r.close, r.prev_close), w1: ret(r.close, r.close_5), m1: ret(r.close, r.close_21),
});

export const fmtPct = (v: number | null | undefined, d = 1) =>
  v == null || !isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(d)}%`;

/** "Impulse · w3 ↑", "Zigzag done ↓", or null without a count. */
export function waveShort(pattern: string | null | undefined, complete: boolean | null | undefined, wave: string | null | undefined, dir: string | null | undefined) {
  if (!pattern) return null;
  const name = PATTERN_LABEL[pattern as CandidatePattern] ?? pattern;
  const arrow = dir === "up" ? "↑" : "↓";
  return complete || !wave || wave === "next" ? `${name} done ${arrow}` : `${name} · w${wave} ${arrow}`;
}

// ---------------------------------------------------------------- market regime

export type RegimeId = "broad_up" | "leaning_up" | "mixed" | "leaning_down" | "broad_down" | "unknown";
export const REGIME_LABEL: Record<RegimeId, string> = {
  broad_up: "Broad uptrend", leaning_up: "Leaning up", mixed: "Mixed", leaning_down: "Leaning down", broad_down: "Broad downtrend", unknown: "Measuring",
};
export const REGIME_METHOD = "Share of measured U.S. securities in uptrends and downtrends (price versus the 50- and 200-day averages), with the share above the 50-day average as a check on participation.";

export interface Regime {
  id: RegimeId; up: number; down: number; mixed: number; above50: number | null; highs: number; lows: number; sentence: string;
}

export function regime(b: Breadth | null, spy?: PulseRow | null): Regime {
  if (!b || !b.measured) return { id: "unknown", up: 0, down: 0, mixed: 0, above50: null, highs: 0, lows: 0, sentence: "Breadth is still being measured." };
  const up = b.uptrend / b.measured, down = b.downtrend / b.measured, mixed = b.mixed / b.measured;
  const above50 = b.measured_50 ? b.above_sma50 / b.measured_50 : null;
  const id: RegimeId =
    up >= 0.5 && (above50 ?? 0) >= 0.55 ? "broad_up"
    : down >= 0.5 && (above50 ?? 1) <= 0.45 ? "broad_down"
    : up - down >= 0.1 ? "leaning_up"
    : down - up >= 0.1 ? "leaning_down"
    : "mixed";
  const p = (v: number) => `${Math.round(v * 100)}%`;
  const parts = [`${REGIME_LABEL[id]}: ${p(up)} of measured securities are in uptrends and ${p(down)} in downtrends`];
  if (above50 != null) parts[0] += `, with ${p(above50)} above their 50-day average.`;
  else parts[0] += ".";
  const highs = b.near_52w_high, lows = b.near_52w_low;
  if (highs || lows) parts.push(highs >= lows ? `Securities near 52-week highs outnumber those near lows ${highs.toLocaleString("en-US")} to ${lows.toLocaleString("en-US")}.` : `Securities near 52-week lows outnumber those near highs ${lows.toLocaleString("en-US")} to ${highs.toLocaleString("en-US")}.`);
  if (spy?.trend === "uptrend" && above50 != null && above50 < 0.5) parts.push("Participation is narrower than the S&P 500 suggests: the index proxy is in an uptrend while fewer than half of securities are above their 50-day average.");
  else if (spy?.trend === "downtrend" && above50 != null && above50 > 0.5) parts.push("The typical security is holding up better than the S&P 500 proxy, which is in a downtrend.");
  return { id, up, down, mixed, above50, highs, lows, sentence: parts.join(" ") };
}

// ---------------------------------------------------------------- what changed

export type FeedKind = "market" | "rates" | "macro" | "breadth" | "structure" | "watchlist" | "move";
export interface FeedItem { kind: FeedKind; text: string; symbol?: string; tone: "pos" | "neg" | "neutral" }
export const FEED_LABEL: Record<FeedKind, string> = {
  market: "Equities", rates: "Rates", macro: "Macro", breadth: "Breadth", structure: "Structure", watchlist: "Watchlist", move: "Mover",
};

export interface StructureChange { symbol: string; text: string; tone: "pos" | "neg" | "neutral" }
export interface Mover { symbol: string; name: string; change_pct: number | null }

const tone = (v: number | null | undefined) => (v == null || Math.abs(v) < 0.0005 ? "neutral" : v > 0 ? "pos" : "neg") as FeedItem["tone"];

/** 5–8 developments: the index tape, rates, the biggest macro move, breadth, then structure changes and movers. */
export function whatChanged(opts: {
  pulse: PulseRow[]; breadth: Breadth | null; market: StructureChange[]; watchlist: StructureChange[]; gainer?: Mover | null; loser?: Mover | null; max?: number;
}): FeedItem[] {
  const by = new Map(opts.pulse.map((r) => [r.symbol, r]));
  const out: FeedItem[] = [];
  const spy = by.get("SPY"), qqq = by.get("QQQ"), iwm = by.get("IWM");
  if (spy) {
    const s = returns(spy), q = qqq ? returns(qqq) : null, i = iwm ? returns(iwm) : null;
    let t = `S&P 500 ${fmtPct(s.d1)} on the day and ${fmtPct(s.w1)} over five sessions`;
    if (q) t += `; Nasdaq-100 ${fmtPct(q.d1)}`;
    if (i) t += `; Russell 2000 ${fmtPct(i.d1)}`;
    out.push({ kind: "market", text: t + ".", symbol: "SPY", tone: tone(s.d1) });
    if (i?.w1 != null && s.w1 != null && Math.abs(i.w1 - s.w1) >= 0.01) {
      const diff = Math.abs(i.w1 - s.w1) * 100;
      out.push({ kind: "market", text: `Small caps ${i.w1 > s.w1 ? "outperformed" : "lagged"} large caps by ${diff.toFixed(1)} points over five sessions.`, symbol: "IWM", tone: i.w1 > s.w1 ? "pos" : "neg" });
    }
  }
  const tlt = by.get("TLT"), shy = by.get("SHY");
  if (tlt) {
    const w = returns(tlt).w1;
    if (w != null && Math.abs(w) >= 0.01) {
      out.push({ kind: "rates", symbol: "TLT", tone: "neutral",
        text: `Long Treasuries ${fmtPct(w)} over five sessions: long-term yields ${w < 0 ? "rose" : "fell"}${shy && returns(shy).w1 != null && Math.abs(returns(shy).w1!) < 0.003 ? " while the short end held steady" : ""}.` });
    } else if (w != null) {
      out.push({ kind: "rates", symbol: "TLT", tone: "neutral", text: `Treasuries were little changed over five sessions (long end ${fmtPct(w)}).` });
    }
  }
  const macro = ["UUP", "GLD", "USO", "IBIT"].map((s) => by.get(s)).filter((r): r is PulseRow => !!r)
    .map((r) => ({ r, w: returns(r).w1 })).filter((x) => x.w != null).sort((a, b) => Math.abs(b.w!) - Math.abs(a.w!));
  if (macro[0] && Math.abs(macro[0].w!) >= 0.015) {
    out.push({ kind: "macro", symbol: macro[0].r.symbol, tone: tone(macro[0].w), text: `${pulseLabel(macro[0].r.symbol)} ${fmtPct(macro[0].w)} over five sessions, the largest move among dollar, gold, oil and bitcoin.` });
  }
  const b = opts.breadth;
  if (b && (b.advancers || b.decliners)) {
    const lead = b.advancers >= b.decliners;
    out.push({ kind: "breadth", tone: lead ? "pos" : "neg",
      text: `${lead ? "Advancers led decliners" : "Decliners led advancers"} ${Math.max(b.advancers, b.decliners).toLocaleString("en-US")} to ${Math.min(b.advancers, b.decliners).toLocaleString("en-US")} at the last close.` });
  }
  for (const c of opts.watchlist.slice(0, 2)) out.push({ kind: "watchlist", symbol: c.symbol, tone: c.tone, text: c.text });
  for (const c of opts.market.slice(0, 3)) if (!out.some((o) => o.symbol === c.symbol)) out.push({ kind: "structure", symbol: c.symbol, tone: c.tone, text: c.text });
  for (const m of [opts.gainer, opts.loser]) {
    if (m?.change_pct != null) out.push({ kind: "move", symbol: m.symbol, tone: tone(m.change_pct), text: `${m.name} ${fmtPct(m.change_pct)}, the ${m.change_pct >= 0 ? "largest gain" : "largest decline"} among securities trading $25M+ a day.` });
  }
  return out.slice(0, opts.max ?? 8);
}

// ---------------------------------------------------------------- Ask Viridia command

export type Command =
  | { kind: "market" } | { kind: "improving" } | { kind: "watchlist" } | { kind: "setups" }
  | { kind: "compare"; symbols: [string, string] } | { kind: "ticker"; symbol: string } | { kind: "unknown" };

export const SUGGESTED_PROMPTS = ["Explain today's market", "Find improving structures", "Compare NVDA and AMD", "Show watchlist changes"];

const STOP = new Set(["A", "I", "AND", "THE", "VS", "TO", "OF", "IN", "ON", "FOR", "ME", "MY", "IS", "IT", "WITH", "SHOW", "COMPARE", "OPEN", "WHAT", "HOW", "ABOUT", "LOOK", "AT", "TELL", "VERSUS", "ETF", "PLEASE", "WHY", "DOES", "DO"]);
const TICKER = /^[A-Z]{1,5}(?:[.-][A-Z])?$/;

/** Tickers named in a command: uppercase words anywhere, or lowercase words after "compare"/"open". */
export function tickersIn(text: string): string[] {
  const words = text.replace(/[,?!;:()]/g, " ").split(/\s+/).filter(Boolean);
  const loose = /^\s*(compare|open|show|look at)\b/i.test(text);
  const out: string[] = [];
  for (const w of words) {
    const u = w.toUpperCase().replace(/^\$/, "").replace(/'S$/, "");
    if (STOP.has(u) || !TICKER.test(u)) continue;
    const typedUpper = w.replace(/^\$/, "") === w.replace(/^\$/, "").toUpperCase() || w.startsWith("$");
    if (typedUpper || (loose && u.length <= 5)) if (!out.includes(u)) out.push(u);
  }
  return out;
}

export function routeCommand(text: string): Command {
  const t = text.trim().toLowerCase();
  if (!t) return { kind: "unknown" };
  if (/watch ?list|my (list|names|stocks)/.test(t)) return { kind: "watchlist" };
  const tickers = tickersIn(text);
  if (/\b(compare|vs\.?|versus)\b/.test(t) && tickers.length >= 2) return { kind: "compare", symbols: [tickers[0], tickers[1]] };
  if (/improv|strengthen|getting better|turning up|breakout/.test(t)) return { kind: "improving" };
  if (/setup|trade idea|buy|sell/.test(t) && !tickers.length) return { kind: "setups" };
  if (/market|today|regime|breadth|macro|rates|what happened/.test(t) && !tickers.length) return { kind: "market" };
  if (tickers.length === 1) return { kind: "ticker", symbol: tickers[0] };
  if (tickers.length >= 2) return { kind: "compare", symbols: [tickers[0], tickers[1]] };
  return { kind: "unknown" };
}

// ---------------------------------------------------------------- structure change sentences

export interface ChangeLike {
  symbol: string; pattern: string | null; complete: boolean | null; wave: string | null; wave_dir: string | null; score: number | null;
  setup_side: string | null; setup_kind: string | null; p_pattern: string | null; p_complete: boolean | null; p_wave: string | null; p_wave_dir: string | null;
  p_score: number | null; p_setup_side: string | null; p_setup_kind: string | null;
  direction_flip: boolean; pattern_change: boolean; setup_new: boolean; setup_gone: boolean; confidence_move: boolean;
}

/** One short sentence per security for the feed, with a tone and whether the change reads as improving. */
export function changeSentence(r: ChangeLike): StructureChange & { improving: boolean } {
  const now = waveShort(r.pattern, r.complete, r.wave, r.wave_dir) ?? "no count";
  if (r.setup_new && r.setup_side) {
    return { symbol: r.symbol, tone: r.setup_side === "buy" ? "pos" : "neg", improving: r.setup_side === "buy",
      text: `New ${r.setup_side} setup: ${SETUP_LABEL[r.setup_kind as SetupKind] ?? r.setup_kind} (${now}).` };
  }
  if (r.direction_flip) {
    return { symbol: r.symbol, tone: r.wave_dir === "up" ? "pos" : "neg", improving: r.wave_dir === "up",
      text: `Preferred count turned ${r.wave_dir === "up" ? "up" : "down"}: now ${now}.` };
  }
  if (r.pattern_change) return { symbol: r.symbol, tone: "neutral", improving: false, text: `Count moved on to ${now}.` };
  if (r.confidence_move && r.score != null && r.p_score != null) {
    return { symbol: r.symbol, tone: r.score > r.p_score ? "pos" : "neg", improving: r.score > r.p_score && r.wave_dir === "up",
      text: `Pattern Confidence ${r.p_score} → ${r.score} (${now}).` };
  }
  if (r.setup_gone) return { symbol: r.symbol, tone: "neutral", improving: false, text: `The ${r.p_setup_side} setup no longer applies (${now}).` };
  return { symbol: r.symbol, tone: "neutral", improving: false, text: `Structure updated: ${now}.` };
}

// ---------------------------------------------------------------- Prepare My Day

export interface DaySection { heading: string; lines: string[] }

export function dayBriefText(title: string, sections: DaySection[]) {
  return [title, "", ...sections.flatMap((s) => [s.heading.toUpperCase(), ...s.lines.map((l) => `• ${l}`), ""])].join("\n").trim();
}

/** "Friday's close", "yesterday's close" or "today's close", from the last bar's date (bars are stamped at 00:00 UTC). */
export function closeLabel(lastTs: string | null | undefined, now = new Date()) {
  if (!lastTs) return "the last close";
  const bar = lastTs.slice(0, 10);
  const et = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const days = Math.round((Date.parse(et) - Date.parse(bar)) / 86_400_000);
  if (days <= 0) return "today's close";
  if (days === 1) return "yesterday's close";
  const wd = new Date(`${bar}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return days < 7 ? `${wd}'s close` : `the ${new Date(`${bar}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} close`;
}

// ---------------------------------------------------------------- security preview (drawer)

export interface PreviewZone { low: number; high: number; mid: number; side: "above" | "below"; count: number; strength: number; distancePct: number; degrees?: string[] }
export interface PreviewSetup {
  side: "buy" | "sell"; kind: string; status: string; rr: number; score: number | null; degree: string; riskPct: number;
  entry: { low: number; high: number; basis: string }; stop: { price: number; basis: string }; target: { price: number; basis: string };
}
export interface SecurityPreview {
  id: number; symbol: string; name: string; exchange: string | null; asset_type: string | null;
  close: number | null; prev_close: number | null; close_5: number | null; close_21: number | null; last_ts: string | null; trend: Trend | null;
  sma50: number | null; sma200: number | null; high_52w: number | null; low_52w: number | null; adv20: number | null; spark: number[] | null;
  daily: { degree: string | null; pattern: string | null; complete: boolean | null; wave: string | null; wave_dir: string | null; score: number | null;
    alt_score: number | null; hold: number | null; hold_side: string | null; target: number | null } | null;
  weekly: { pattern: string | null; complete: boolean | null; wave: string | null; wave_dir: string | null; score: number | null } | null;
  setup: PreviewSetup | null; zone: PreviewZone | null;
  history: { day: string; pattern: string | null; wave: string | null; wave_dir: string | null; score: number | null; setup_side: string | null; setup_kind: string | null }[];
}

export const confidenceBand = (s: number | null | undefined) => (s == null ? null : s >= 70 ? "High" : s >= 58 ? "Medium" : "Low");
