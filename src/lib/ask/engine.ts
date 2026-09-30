/**
 * Ask Viridia's pipeline: classify the question, resolve which securities it's about (typed, the
 * page's, or the conversation's), plan and run only the tools it needs, build typed evidence blocks
 * with citations, then (optionally) have a language model write a short interpretation that is
 * checked against the evidence before it's shown. Data first; the model explains, it is never the
 * source. When data isn't available the answer says so instead of estimating.
 */
import { SWING_LABEL } from "@/lib/analysis/pivots";
import { PATTERN_LABEL, type CandidatePattern } from "@/lib/analysis/candidates";
import { eventSentence, eventTone } from "@/lib/analysis/events";
import { REGIME_LABEL, regime, returns, fmtPct, waveShort, type PulseRow } from "@/lib/analysis/mission";
import { parseScanQuery } from "@/lib/command/scan-query";
import { answer as portfolioAnswer } from "@/lib/portfolio/ask";
import type { SecurityPreview } from "@/lib/analysis/mission";
import { CONCEPTS, findConcept, type Concept } from "./glossary";
import { route, type Route } from "./router";
import type { AskStructure, Tools } from "./tools";
import {
  CITATION_LABEL, type Action, type Answer, type AskEvent, type AskRequest, type Audience, type Block, type Citation, type CitationKind,
  type Evidence, type Intent, type Metric, type TraceEntry,
} from "./types";

export interface Llm {
  model: string;
  /** Streams text; resolves with token usage. */
  stream(system: string, user: string, onDelta: (t: string) => void): Promise<{ text: string; tokensIn: number; tokensOut: number }>;
}

// ---------------------------------------------------------------- formatting

const px = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: v >= 1 ? 2 : 4 })}`);
const pc = (v: number | null | undefined, d = 1) => fmtPct(v, d);
const usdBig = (v: number | null | undefined) => {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  return a >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : a >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${Math.round(v).toLocaleString("en-US")}`;
};
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
const pattern = (p: string | null | undefined) => (p ? PATTERN_LABEL[p as CandidatePattern] ?? p : null);
const swing = (s: string | null | undefined) => (s ? (SWING_LABEL as Record<string, string>)[s] ?? s : "not enough swings");
const MOTIVE = new Set(["impulse", "leading_diagonal", "ending_diagonal"]);

// ---------------------------------------------------------------- answer builder

class Builder {
  blocks: Block[] = [];
  citations: Citation[] = [];
  reasons: string[] = [];
  missing: string[] = [];
  conflicts: string[] = [];
  followups: string[] = [];
  actions: Action[] = [];
  symbols: string[] = [];
  tools: TraceEntry[] = [];
  dataAsOf: string | null = null;
  constructor(private emit: (e: AskEvent) => void) {}
  cite(kind: CitationKind, title: string, detail: string, asOf?: string | null, href?: string): number {
    const hit = this.citations.find((c) => c.kind === kind && c.title === title);
    if (hit) return hit.id;
    const c: Citation = { id: this.citations.length + 1, kind, title, detail, asOf: asOf ?? null, href };
    this.citations.push(c);
    if (asOf && (!this.dataAsOf || asOf > this.dataAsOf)) this.dataAsOf = asOf;
    return c.id;
  }
  add(b: Block) { this.blocks.push(b); this.emit({ type: "block", block: b }); }
  status(t: string) { this.emit({ type: "status", text: t }); }
  unavailable(what: string, why: string) { this.missing.push(what); this.add({ type: "unavailable", what, why }); }
  async tool<T>(name: string, f: () => Promise<T>, rows?: (v: T) => number): Promise<T | null> {
    const t0 = Date.now();
    try {
      const v = await f();
      this.tools.push({ tool: name, ms: Date.now() - t0, ok: true, rows: rows ? rows(v) : undefined });
      return v;
    } catch (e) {
      this.tools.push({ tool: name, ms: Date.now() - t0, ok: false, error: (e as Error).message.slice(0, 200) });
      return null;
    }
  }
}

const FUNDAMENTALS_WHY = "Company fundamentals (financial statements, estimates, valuation multiples, earnings dates, filings and transcripts) aren't loaded in Viridia yet, so this can't be answered from data. Viridia won't estimate it.";

// ---------------------------------------------------------------- main

export async function runAsk(req: AskRequest, tools: Tools, emit: (e: AskEvent) => void, llm?: Llm | null): Promise<Answer> {
  const t0 = Date.now();
  const audience: Audience = req.audience ?? "professional";
  const depth = req.depth ?? "research";
  const ctx = req.useContext === false ? {} : req.context ?? {};
  const b = new Builder(emit);
  let r = route(req.q, ctx, req.last ?? [], req.entities ?? [], req.useContext !== false);

  // "explain this to a client": the same question in client language
  let aud = audience;
  if (r.intent === "CLIENT_EXPLANATION") {
    aud = "client";
    const stripped = r.text.replace(/\b(explain|say|put)\b(.*?)\b(like|to|for) (a |my )?client\b/i, "$2").replace(/\bclient[- ]friendly\b/i, "").trim() || "tell me about this";
    const r2 = route(stripped, ctx, req.last ?? [], req.entities ?? [], req.useContext !== false);
    r = { ...r2, intent: r2.intent === "UNKNOWN" && (r2.implied.length || r2.tokens.length) ? "COMPANY_RESEARCH" : r2.intent };
    if (r.intent === "UNKNOWN" && req.last?.length) r = { ...r, intent: "COMPANY_RESEARCH", implied: req.last.slice(0, 1), impliedFrom: "last" };
  }

  // resolve typed tickers against the security master
  let symbols: string[] = [];
  let unknown: string[] = [];
  if (r.tokens.length) {
    b.status("Resolving securities…");
    const found = await b.tool("resolve_symbols", () => tools.resolveSymbols(r.tokens), (v) => v.length) ?? [];
    symbols = found.map((f) => f.symbol);
    unknown = r.tokens.filter((t) => !symbols.includes(t));
    // a single lower-case word that isn't a ticker was never meant as one
  }
  if (!symbols.length && r.implied.length) symbols = r.implied;
  // re-route if the typed "ticker" didn't resolve (it was a word)
  if (!symbols.length && r.tokens.length) {
    const r2 = route(r.text.replace(new RegExp(`\\b(${r.tokens.join("|")})\\b`, "gi"), (m) => m.toLowerCase()), ctx, [], [], false);
    if (r2.intent !== r.intent && ["FINANCIAL_EDUCATION", "MARKET_RESEARCH", "MACROECONOMICS", "SCREENER_QUERY", "PORTFOLIO_ANALYSIS", "GENERAL_FINANCE"].includes(r2.intent)) r = { ...r2, tokens: [] };
  }
  b.symbols = symbols;
  let intent: Intent = r.intent;
  if (symbols.length === 0 && ["COMPANY_RESEARCH", "VIRIDIA_STRUCTURE", "TECHNICAL_ANALYSIS", "VALUATION", "EARNINGS", "FILINGS", "FUNDAMENTAL_ANALYSIS"].includes(intent)) {
    intent = r.conceptId ? "FINANCIAL_EDUCATION" : "UNKNOWN";
  }
  if (intent === "COMPARISON" && symbols.length < 2) intent = symbols.length === 1 ? "COMPANY_RESEARCH" : "UNKNOWN";
  emit({ type: "intent", intent, symbols });
  if (r.impliedFrom && symbols.length) b.reasons.push(r.impliedFrom === "page" ? `"${symbols[0]}" taken from the page you're on.` : r.impliedFrom === "last" ? `Securities carried from the previous answer: ${symbols.join(", ")}.` : `Securities from this workspace: ${symbols.join(", ")}.`);
  if (unknown.length && symbols.length) b.reasons.push(`Not recognized as covered tickers: ${unknown.join(", ")}.`);

  let title = req.q;
  switch (intent) {
    case "FINANCIAL_EDUCATION": title = await education(b, r, aud); break;
    case "COMPANY_RESEARCH": title = await company(b, tools, symbols[0], aud, depth, ctx.zone ?? null, r.text); break;
    case "VIRIDIA_STRUCTURE": title = await structure(b, tools, symbols[0], aud, depth, ctx, r.text); break;
    case "TECHNICAL_ANALYSIS": title = await technical(b, tools, symbols[0], aud); break;
    case "VALUATION": case "EARNINGS": case "FILINGS": case "FUNDAMENTAL_ANALYSIS": title = await fundamentals(b, tools, symbols[0], intent, r, aud); break;
    case "COMPARISON": title = await comparison(b, tools, symbols.slice(0, 5), aud); break;
    case "SCREENER_QUERY": title = await screener(b, tools, r.text); break;
    case "PORTFOLIO_ANALYSIS": title = await portfolio(b, tools, r.text, ctx.portfolioId ?? null); break;
    case "MARKET_RESEARCH": title = await market(b, tools, r.text, depth); break;
    case "MACROECONOMICS": title = await macro(b, tools, r, aud); break;
    case "WATCHLIST_ACTION": title = watchAction(b, symbols, r.text); break;
    default: title = unknownAnswer(b, r, req.q);
  }

  // optional model interpretation, validated against the evidence
  let llmInfo: Answer["trace"]["llm"] = { used: false };
  const hasEvidence = b.blocks.some((x) => x.type !== "unavailable" && x.type !== "actions");
  if (llm && depth !== "quick" && hasEvidence && intent !== "WATCHLIST_ACTION") {
    b.status("Writing interpretation…");
    const evidence = JSON.stringify(b.blocks.filter((x) => x.type !== "actions"));
    const sys = SYSTEM(aud);
    try {
      let buf = "";
      const res = await llm.stream(sys, `Question: ${req.q}\n\nEvidence (JSON, the only source of facts):\n${evidence}`, (d) => { buf += d; });
      const ok = validateNumbers(res.text, evidence);
      llmInfo = { used: true, model: llm.model, tokensIn: res.tokensIn, tokensOut: res.tokensOut, rejected: !ok };
      if (ok && res.text.trim()) {
        const text = res.text.trim();
        emit({ type: "text", delta: text });
        b.add({ type: "text", role: "interpretation", text });
      }
      void buf;
    } catch (e) {
      b.tools.push({ tool: "llm", ms: 0, ok: false, error: (e as Error).message.slice(0, 200) });
    }
  }

  if (b.actions.length) b.add({ type: "actions", items: b.actions });
  const answer: Answer = {
    intent, title, blocks: b.blocks, citations: b.citations,
    evidence: evidenceOf(b, intent), followups: b.followups.slice(0, 4), symbols,
    trace: { intent, symbols, tools: b.tools, sources: b.citations.map((c) => `${CITATION_LABEL[c.kind]}: ${c.title}`), dataAsOf: b.dataAsOf, ms: Date.now() - t0, llm: llmInfo },
  };
  emit({ type: "done", answer });
  return answer;
}

// ---------------------------------------------------------------- evidence state

function evidenceOf(b: Builder, intent: Intent): Answer["evidence"] {
  const reasons = [...b.reasons];
  const dataBlocks = b.blocks.filter((x) => !["unavailable", "actions", "text", "definition"].includes(x.type)).length;
  if (intent === "FINANCIAL_EDUCATION") return { state: "strong", reasons: ["Reference definition; no live data needed.", ...reasons] };
  let state: Evidence;
  if (!dataBlocks) state = "insufficient";
  else if (b.conflicts.length) state = "conflicting";
  else if (b.missing.length) state = dataBlocks >= 2 ? "moderate" : "limited";
  else state = dataBlocks >= 2 ? "strong" : "moderate";
  for (const c of b.conflicts) reasons.push(c);
  for (const m of b.missing) reasons.push(`Not available: ${m}.`);
  if (b.citations.length) reasons.push(`${b.citations.length} source${b.citations.length === 1 ? "" : "s"}: ${b.citations.map((c) => CITATION_LABEL[c.kind]).filter((v, i, a) => a.indexOf(v) === i).join(", ")}.`);
  return { state, reasons };
}

// ---------------------------------------------------------------- education

async function education(b: Builder, r: Route, aud: Audience): Promise<string> {
  const c = CONCEPTS.find((x) => x.id === r.conceptId) ?? findConcept(r.text);
  if (!c) return unknownAnswer(b, r, r.text);
  const cite = b.cite("glossary", "Viridia financial reference", "Reference explanation reviewed for accuracy; no live data.");
  b.add({ type: "definition", term: c.title, text: c.text[aud], formula: aud === "client" || aud === "beginner" ? undefined : c.formula, related: c.related?.map((id) => CONCEPTS.find((x) => x.id === id)?.title ?? id) });
  if (c.calc && aud !== "client") b.add({ type: "calculation", title: c.calc.title, inputs: c.calc.inputs.map(([label, value]) => ({ label, value })), formula: c.calc.formula, result: c.calc.result });
  void cite;
  if (c.see) b.actions.push({ kind: "link", label: c.see.label, href: c.see.href });
  const rel = (c.related ?? []).map((id) => CONCEPTS.find((x) => x.id === id)).filter((x): x is Concept => !!x).slice(0, 2);
  b.followups.push(...rel.map((x) => `Explain ${x.title.replace(/ \(.*\)$/, "")}`));
  if (aud !== "client") b.followups.push(`Explain ${c.title.replace(/ \(.*\)$/, "")} to a client`);
  return c.title;
}

// ---------------------------------------------------------------- company research

function securityBlock(b: Builder, s: SecurityPreview, aud: Audience): void {
  const r = returns({ close: s.close, prev_close: s.prev_close, close_5: s.close_5, close_21: s.close_21 });
  const cite = b.cite("market_data", `${s.symbol} end-of-day prices`, "Massive end-of-day bars stored by Viridia (split-adjusted).", day(s.last_ts), `/terminal/${s.symbol}`);
  const range = s.high_52w && s.low_52w && s.close != null && s.high_52w > s.low_52w ? (s.close - s.low_52w) / (s.high_52w - s.low_52w) : null;
  const metrics: Metric[] = [
    { label: "1 week", value: pc(r.w1), tone: tone(r.w1), cite },
    { label: "1 month", value: pc(r.m1), tone: tone(r.m1), cite },
    { label: "vs 50-day", value: s.sma50 && s.close ? pc(s.close / s.sma50 - 1) : "—", cite },
    { label: "vs 200-day", value: s.sma200 && s.close ? pc(s.close / s.sma200 - 1) : "—", cite },
    { label: "52-week range", value: s.low_52w && s.high_52w ? `${px(s.low_52w)} – ${px(s.high_52w)}` : "—", cite },
    { label: "Range position", value: range != null ? `${Math.round(range * 100)}%` : "—", cite },
    { label: "Trend", value: s.trend ? s.trend[0].toUpperCase() + s.trend.slice(1) : "—", cite },
    ...(aud === "client" ? [] : [{ label: "Avg daily $ volume", value: usdBig(s.adv20), cite }]),
  ];
  b.add({ type: "security", symbol: s.symbol, name: s.name, price: px(s.close), change: pc(r.d1, 2), tone: tone(r.d1), metrics, asOf: day(s.last_ts), cite });
}
const tone = (v: number | null | undefined) => (v == null ? undefined : v >= 0 ? "pos" : "neg") as "pos" | "neg" | undefined;

async function company(b: Builder, tools: Tools, sym: string, aud: Audience, depth: string, zone: { low: number; high: number } | null, text: string): Promise<string> {
  b.status(`Looking up ${sym}…`);
  const [s, st, ev] = await Promise.all([
    b.tool("get_security", () => tools.security(sym)),
    b.tool("get_viridia_structure", () => tools.structure(sym)),
    b.tool("get_security_changes", () => tools.events([sym], depth === "deep" ? 30 : 10, 12), (v) => v.length),
  ]);
  if (!s) { b.unavailable(`data for ${sym}`, "Viridia couldn't load this security right now."); return sym; }
  securityBlock(b, s, aud);
  const moveQ = /\bwhy\b.*\b(move|moved|up|down|fall|fell|drop|dropped|rise|rose|jump|jumped|rall)/i.test(text);
  if (moveQ) {
    const r = returns(s);
    b.add({ type: "text", role: "fact", text: `${sym} closed at ${px(s.close)} on ${day(s.last_ts)}, ${pc(r.d1, 2)} on the day and ${pc(r.w1)} over five sessions.`, cite: [b.cite("market_data", `${s.symbol} end-of-day prices`, "", day(s.last_ts))] });
    b.unavailable("news and company announcements", "Viridia doesn't hold news, so it can't say what caused the move. It can show what changed in the structure.");
  }
  b.status("Analyzing Viridia structure…");
  structureBlocks(b, s, st, aud, zone, null);
  eventsBlock(b, sym, ev ?? []);
  if (!moveQ) b.unavailable("business description, financial trend, valuation and earnings", FUNDAMENTALS_WHY);
  risksBlock(b, s, st, aud);
  b.followups.push(`Explain ${sym}'s current wave count`, `Show ${sym}'s Fibonacci zones`, `What would invalidate ${sym}?`, peerQuestion(sym));
  b.actions.push({ kind: "link", label: `Open ${sym}`, href: `/terminal/${sym}` }, { kind: "watch", label: `Add ${sym} to watchlist`, symbols: [sym] });
  return `${s.name} (${sym})`;
}

const peerQuestion = (sym: string) => `Compare ${sym} with ${sym === "SPY" ? "QQQ" : "SPY"}`;

function risksBlock(b: Builder, s: SecurityPreview, st: AskStructure | null, aud: Audience) {
  const lines: string[] = [];
  const d = s.daily;
  if (d?.hold != null && s.close) {
    const dist = d.hold / s.close - 1;
    lines.push(aud === "client"
      ? `The current read of the chart would change if the price moved to about ${px(d.hold)} (${pc(dist)} from the last close).`
      : `Structural: the preferred count is invalidated at ${px(d.hold)}, ${pc(dist)} from the close.`);
  }
  if (s.high_52w && s.close) lines.push(`${aud === "client" ? "Distance from its 52-week high" : "Drawdown from 52-week high"}: ${pc(s.close / s.high_52w - 1)}.`);
  if (st?.close_call) lines.push(aud === "client" ? "The chart can be read more than one way right now, so any read is less certain than usual." : "Competing counts: the top two interpretations score within 5 points, so the preferred count is not well separated.");
  if (s.weekly?.wave_dir && d?.wave_dir && s.weekly.wave_dir !== d.wave_dir) lines.push(aud === "client" ? "The short-term and longer-term pictures point in different directions." : "The weekly preferred count points the other way from the daily.");
  if (s.setup_check?.flags?.length) lines.push("Viridia's scenario for this security was held back by its sanity checks.");
  if (!lines.length) return;
  b.add({ type: "market", title: aud === "client" ? "Things to keep in mind" : "Risks from the data", metrics: [], lines, cite: [b.cite("viridia_engine", `${s.symbol} structure`, "", day(s.setup_check?.analysis_ts ?? s.last_ts))] });
}

function eventsBlock(b: Builder, sym: string, ev: import("@/lib/analysis/events").StructureEvent[]) {
  if (!ev.length) return;
  const cite = b.cite("viridia_events", `${sym} structural changes`, "Viridia compares each session's analysis with the previous one.", ev[0].day, `/terminal/${sym}`);
  b.add({ type: "events", title: "Recent developments (Viridia)", items: ev.slice(0, 6).map((e) => ({ symbol: e.symbol, day: e.day, text: eventSentence(e), tone: eventTone(e) })), cite });
}

// ---------------------------------------------------------------- structure

function structureBlocks(b: Builder, s: SecurityPreview, st: AskStructure | null, aud: Audience, zone: { low: number; high: number } | null, degree: string | null) {
  const d = s.daily;
  const asOf = day(st?.analysis_ts ?? s.last_ts);
  const cite = b.cite("viridia_engine", `${s.symbol} structure`, "Viridia structure engine: rule-checked Elliott Wave candidates, swings and Fibonacci confluence.", asOf, `/terminal/${s.symbol}`);
  const rows: { label: string; value: string; note?: string }[] = [];
  const sw = st?.swing ?? {};
  if (aud !== "client") {
    rows.push({ label: "Primary swings", value: swing(sw.primary) }, { label: "Intermediate swings", value: swing(sw.intermediate) }, { label: "Minor swings", value: swing(sw.minor) });
  } else {
    rows.push({ label: "Longer-term pattern", value: swing(sw.primary).toLowerCase().replace(/^./, (m) => m.toUpperCase()) });
  }
  const wave = d?.pattern ? `${pattern(d.pattern)} · ${d.complete ? "complete" : `wave ${d.wave}`} ${d.wave_dir === "up" ? "↑" : d.wave_dir === "down" ? "↓" : ""}`.trim() : null;
  if (st?.candidates != null) rows.push({ label: aud === "client" ? "Readings considered" : "Valid interpretations", value: `${st.candidates}`, note: aud === "client" ? "chart readings that pass the rules" : "rule-valid candidate counts across degrees" });
  if (st?.close_call) {
    b.conflicts.push("The top two counts score within 5 points of each other.");
    rows.push({ label: aud === "client" ? "Main reading" : "Preferred count", value: wave ? `${wave} (not well separated)` : "None assigned", note: d?.score != null && d.alt_score != null ? `Pattern Confidence ${d.score} vs alternate ${d.alt_score}` : undefined });
  } else {
    rows.push({ label: aud === "client" ? "Main reading" : "Preferred count", value: wave ?? "None assigned", note: d?.score != null ? `Pattern Confidence ${d.score}${d.alt_score != null ? `, alternate ${d.alt_score}` : ""} (fit, not probability)` : undefined });
  }
  if (d?.degree) rows.push({ label: "Degree", value: d.degree[0].toUpperCase() + d.degree.slice(1), note: degree && degree !== d.degree ? `you're viewing ${degree}; the summary count is at ${d.degree}` : undefined });
  const inv = d?.hold ?? null;
  if (inv != null && s.close) rows.push({ label: aud === "client" ? "Level that changes the view" : "Invalidation", value: px(inv), note: `${pc(inv / s.close - 1)} from the close` });
  if (d?.target != null && s.close) rows.push({ label: aud === "client" ? "Next area of interest" : "Structural target", value: px(d.target), note: `${pc(d.target / s.close - 1)} from the close` });
  if (s.weekly?.pattern) {
    const agree = s.weekly.wave_dir && d?.wave_dir ? s.weekly.wave_dir === d.wave_dir : null;
    rows.push({ label: "Weekly count", value: waveShort(s.weekly.pattern, s.weekly.complete, s.weekly.wave, s.weekly.wave_dir) ?? "—", note: agree == null ? undefined : agree ? "agrees with the daily" : "points the other way" });
    if (agree === false) b.conflicts.push("The weekly count points the other way from the daily.");
  }
  const up = d?.wave_dir === "up";
  const nz = st?.zones?.[0];
  const means: string[] = [], strengthen: string[] = [], weaken: string[] = [], monitor: string[] = [];
  if (d?.pattern) {
    const motive = MOTIVE.has(d.pattern);
    if (aud === "client") {
      means.push(motive
        ? `Viridia reads the recent ${up ? "rise" : "decline"} as part of a larger ${up ? "advance" : "decline"} that ${d.complete ? "may have run its course" : "may still be unfolding"}. This is one possible reading of the chart, not a forecast.`
        : `Viridia reads the recent move as a pause or correction ${d.complete ? "that looks complete" : "that may still be unfolding"}. This is one possible reading of the chart, not a forecast.`);
    } else {
      means.push(`${motive ? "A motive (trend) structure" : "A corrective structure"}${d.complete ? " that looks complete" : ` in wave ${d.wave}`}, expecting the next move ${up ? "up" : "down"}${d.score != null ? ` at Pattern Confidence ${d.score}` : ""}.`);
      if (st?.close_call) means.push("The top interpretations are close, so treat the preferred count as one of several live scenarios.");
    }
    if (inv != null) {
      weaken.push(aud === "client" ? `A move ${up ? "below" : "above"} about ${px(inv)} would mean this reading is wrong.` : `A move ${up ? "below" : "above"} ${px(inv)} invalidates the preferred count.`);
      strengthen.push(aud === "client" ? `Holding ${up ? "above" : "below"} ${px(inv)} keeps this reading intact.` : `Price holding ${up ? "above" : "below"} ${px(inv)} with ${up ? "advances" : "declines"} continuing in the expected direction.`);
    }
    if (s.weekly?.wave_dir && s.weekly.wave_dir === d.wave_dir) strengthen.push(aud === "client" ? "The longer-term picture points the same way." : "The weekly count already agrees with the daily.");
    else if (s.weekly?.wave_dir) strengthen.push(aud === "client" ? "The longer-term picture turning the same way." : "The weekly count aligning with the daily.");
  } else {
    means.push(aud === "client" ? "Viridia doesn't have a clear reading of this chart right now." : "No preferred count is assigned; Viridia shows nothing rather than a guess.");
  }
  if (nz) monitor.push(`${aud === "client" ? "Price area" : "Fibonacci confluence"} ${px(nz.low)}–${px(nz.high)} (${pc(nz.distancePct)} away, ${nz.count} relationships).`);
  if (inv != null) monitor.push(`${aud === "client" ? "The level" : "Invalidation"} at ${px(inv)}.`);
  if (s.trend) monitor.push(aud === "client" ? `Whether the ${s.trend === "uptrend" ? "uptrend" : s.trend === "downtrend" ? "downtrend" : "sideways trend"} continues.` : `Trend state (now ${s.trend}) against the 50- and 200-day averages.`);
  b.add({ type: "structure", symbol: s.symbol, rows, means, strengthen, weaken, monitor, cite });
  const zones = (st?.zones ?? []).map((z) => ({ low: z.low, high: z.high, dist: z.distancePct, count: z.count, strength: z.strength, levels: z.levels.slice(0, 4).map((l) => `${l.label} (${l.degree}) ${px(l.price)}`) }));
  if (zone) {
    const sel = zones.find((z) => Math.abs(z.low - zone.low) < 1e-6 * Math.max(1, zone.low) + 0.01 && Math.abs(z.high - zone.high) < 0.01 + 1e-6 * zone.high);
    if (sel) { zones.splice(zones.indexOf(sel), 1); zones.unshift(sel); }
    else if (s.close) zones.unshift({ low: zone.low, high: zone.high, dist: ((zone.low + zone.high) / 2) / s.close - 1, count: 0, strength: 0, levels: ["Selected on the page (its relationships are listed in the Fibonacci map)"] });
  }
  if (zones.length) b.add({ type: "fibzones", symbol: s.symbol, close: s.close, zones, cite });
  if (s.setup && !(s.setup_check?.flags?.length)) {
    b.add({ type: "text", role: "analysis", text: `${aud === "client" ? "Viridia's scenario" : "Structural scenario"}: ${s.setup.side === "buy" ? "bullish" : "bearish"} ${s.setup.kind.replace(/_/g, " ")}, reference ${px(s.setup.entry.low)}–${px(s.setup.entry.high)}, invalidation ${px(s.setup.stop.price)}, structural target ${px(s.setup.target.price)} (${s.setup.rr.toFixed(1)} : 1). Research scenario, not a recommendation.`, cite: [cite] });
  }
}

async function structure(b: Builder, tools: Tools, sym: string, aud: Audience, depth: string, ctx: AskRequest["context"] & object, text: string): Promise<string> {
  b.status(`Loading ${sym} structure…`);
  const [s, st, ev] = await Promise.all([
    b.tool("get_security", () => tools.security(sym)),
    b.tool("get_wave_candidates", () => tools.structure(sym)),
    depth === "quick" ? Promise.resolve([]) : b.tool("get_security_changes", () => tools.events([sym], 10, 8), (v) => v.length),
  ]);
  if (!s) { b.unavailable(`structure for ${sym}`, "Viridia couldn't load this security right now."); return sym; }
  const zoneQ = /\b(this|the) (zone|level|area)\b|\bwhy is this important\b|\bfib(onacci)?\b|\bzone/i.test(text);
  structureBlocks(b, s, st, aud, ctx.zone ?? null, ctx.degree ?? null);
  if (zoneQ && ctx.zone) b.add({ type: "text", role: "analysis", text: `The selected zone ${px(ctx.zone.low)}–${px(ctx.zone.high)} is where independent Fibonacci measurements of ${sym}'s waves overlap. Zones like this are areas where the current count expects a reaction or completion; they are areas of interest, not predicted turning points.`, cite: [b.cite("viridia_engine", `${sym} structure`, "")] });
  eventsBlock(b, sym, ev ?? []);
  b.followups.push(`Show ${sym}'s Fibonacci zones`, `Compare ${sym} with SPY`, `Explain ${sym} to a client`, `What changed in ${sym} this week?`);
  b.actions.push({ kind: "link", label: `Open ${sym} structure`, href: `/terminal/${sym}#structure` });
  return `${sym} · Viridia Intelligence`;
}

async function technical(b: Builder, tools: Tools, sym: string, aud: Audience): Promise<string> {
  const [s, st] = await Promise.all([b.tool("get_security", () => tools.security(sym)), b.tool("get_wave_candidates", () => tools.structure(sym))]);
  if (!s) { b.unavailable(`data for ${sym}`, "Viridia couldn't load this security right now."); return sym; }
  securityBlock(b, s, aud);
  structureBlocks(b, s, st, aud, null, null);
  b.unavailable("oscillators such as RSI or MACD", "Viridia doesn't compute these; it measures trend against the 50- and 200-day averages and wave structure.");
  b.followups.push(`What would invalidate ${sym}?`, `Compare ${sym} with SPY`);
  return `${sym} · Trend and structure`;
}

// ---------------------------------------------------------------- fundamentals (not loaded)

async function fundamentals(b: Builder, tools: Tools, sym: string, intent: Intent, r: Route, aud: Audience): Promise<string> {
  const what = intent === "VALUATION" ? "valuation multiples and price targets" : intent === "EARNINGS" ? "earnings results, estimates and dates" : intent === "FILINGS" ? "SEC filings and transcripts" : "financial statements (revenue, margins, cash flow)";
  b.unavailable(`${sym} ${what}`, FUNDAMENTALS_WHY);
  const s = await b.tool("get_security", () => tools.security(sym));
  if (s) securityBlock(b, s, aud);
  const c = r.conceptId ? CONCEPTS.find((x) => x.id === r.conceptId) : null;
  if (c) b.add({ type: "definition", term: c.title, text: c.text[aud], formula: c.formula });
  b.followups.push(`What does Viridia see in ${sym}?`, ...(c ? [`Explain ${c.title.replace(/ \(.*\)$/, "")}`] : []));
  return `${sym} · ${intent === "VALUATION" ? "Valuation" : intent === "EARNINGS" ? "Earnings" : intent === "FILINGS" ? "Filings" : "Fundamentals"}`;
}

// ---------------------------------------------------------------- comparison

async function comparison(b: Builder, tools: Tools, syms: string[], aud: Audience): Promise<string> {
  b.status(`Comparing ${syms.join(", ")}…`);
  const data = await Promise.all(syms.map(async (s) => ({ s, p: await b.tool(`get_security:${s}`, () => tools.security(s)), st: await b.tool(`get_viridia_structure:${s}`, () => tools.structure(s)) })));
  const ok = data.filter((d) => d.p) as { s: string; p: SecurityPreview; st: AskStructure | null }[];
  if (ok.length < 2) { b.unavailable("enough securities to compare", "At least two of these couldn't be loaded."); return "Comparison"; }
  const asOf = day(ok[0].p.last_ts);
  const c1 = b.cite("market_data", "End-of-day prices", "Massive end-of-day bars stored by Viridia.", asOf);
  const c2 = b.cite("viridia_engine", "Viridia structure engine", "Preferred counts, swings, invalidation and Fibonacci zones.", asOf);
  const R = ok.map((d) => returns(d.p));
  const rangePos = (p: SecurityPreview) => (p.high_52w && p.low_52w && p.close != null && p.high_52w > p.low_52w ? `${Math.round(((p.close - p.low_52w) / (p.high_52w - p.low_52w)) * 100)}%` : "—");
  const invDist = (p: SecurityPreview) => (p.daily?.hold != null && p.close ? p.daily.hold / p.close - 1 : null);
  const zoneDist = (st: AskStructure | null) => st?.zones?.[0]?.distancePct ?? null;
  const sections = [
    { title: "Market", rows: [
      { label: "Price", values: ok.map((d) => px(d.p.close)) },
      { label: "Day", values: R.map((r) => pc(r.d1, 2)) },
      { label: "1 month", values: R.map((r) => pc(r.m1)) },
      { label: "52-week range position", values: ok.map((d) => rangePos(d.p)) },
      { label: "Avg daily $ volume", values: ok.map((d) => usdBig(d.p.adv20)) },
    ] },
    { title: "Growth, profitability and valuation", rows: [{ label: "Revenue, margins, P/E, EV/EBITDA, FCF yield", values: ok.map(() => "Not loaded") }] },
    { title: "Viridia Intelligence", rows: [
      { label: "Trend", values: ok.map((d) => d.p.trend ?? "—") },
      { label: "Intermediate swings", values: ok.map((d) => swing(d.st?.swing?.intermediate)) },
      { label: "Preferred count", values: ok.map((d) => waveShort(d.p.daily?.pattern, d.p.daily?.complete, d.p.daily?.wave, d.p.daily?.wave_dir) ?? "None") },
      { label: "Pattern Confidence", values: ok.map((d) => (d.p.daily?.score != null ? `${d.p.daily.score}${d.st?.close_call ? " (close call)" : ""}` : "—")) },
      { label: "To invalidation", values: ok.map((d) => pc(invDist(d.p))) },
      { label: "Nearest Fib zone", values: ok.map((d) => pc(zoneDist(d.st))) },
      { label: "Weekly count", values: ok.map((d) => (d.p.weekly?.wave_dir && d.p.daily?.wave_dir ? (d.p.weekly.wave_dir === d.p.daily.wave_dir ? "agrees" : "differs") : "—")) },
    ] },
  ];
  const diffs: string[] = [];
  const trends = ok.map((d) => d.p.trend);
  if (new Set(trends).size > 1) diffs.push(`Trend: ${ok.map((d) => `${d.s} ${d.p.trend ?? "unmeasured"}`).join(", ")}.`);
  const m1 = R.map((r, i) => ({ s: ok[i].s, v: r.m1 })).filter((x) => x.v != null).sort((a, b2) => b2.v! - a.v!);
  if (m1.length >= 2) diffs.push(`Over the past month ${m1[0].s} returned ${pc(m1[0].v)} and ${m1[m1.length - 1].s} ${pc(m1[m1.length - 1].v)}.`);
  const inv = ok.map((d) => ({ s: d.s, v: invDist(d.p) })).filter((x) => x.v != null).sort((a, b2) => Math.abs(a.v!) - Math.abs(b2.v!));
  if (inv.length >= 2) diffs.push(`${inv[0].s} is closest to its invalidation level (${pc(inv[0].v)}); ${inv[inv.length - 1].s} is furthest (${pc(inv[inv.length - 1].v)}).`);
  const cc = ok.filter((d) => d.st?.close_call).map((d) => d.s);
  if (cc.length) diffs.push(`${cc.join(", ")} ${cc.length === 1 ? "has" : "have"} competing counts within 5 points, so ${cc.length === 1 ? "its" : "their"} preferred count is less settled.`);
  diffs.push("This compares measurements; it doesn't rank the securities or suggest one over another.");
  b.add({ type: "comparison", symbols: ok.map((d) => d.s), sections, differences: diffs, cite: [c1, c2] });
  b.unavailable("fundamental comparison (growth, margins, valuation)", FUNDAMENTALS_WHY);
  b.followups.push(`What does Viridia see in ${ok[0].s}?`, `Explain the difference to a client`, `Add ${ok.map((d) => d.s).join(" and ")} to my watchlist`);
  b.actions.push({ kind: "watch", label: `Add ${ok.map((d) => d.s).join(", ")} to watchlist`, symbols: ok.map((d) => d.s) });
  void aud;
  return `Compare ${ok.map((d) => d.s).join(" · ")}`;
}

// ---------------------------------------------------------------- screener

const SCAN_MAP: Record<string, string> = { s: "p_structure", trend: "p_trend", dir: "p_direction", score: "p_min_score", near: "p_near", type: "p_type", dv: "p_min_dollar_volume", sort: "p_sort" };
const PARAM_LABEL: Record<string, string> = { s: "Structure", trend: "Trend", dir: "Expected direction", score: "Pattern Confidence", near: "52-week range", type: "Security type", dv: "Liquidity", sort: "Sorted by" };

export function interpretScreen(text: string): { href: string; params: Record<string, unknown>; interpreted: { label: string; value: string }[]; ignored: string[] } | null {
  const q = parseScanQuery(text);
  const ignored: string[] = [];
  if (/\b(semiconductors?|semis|chips?|tech(nology)?|financials?|banks?|energy|health ?care|biotech|utilities|industrials?|real estate|reits?|consumer|materials|communications?)\b/i.test(text)) ignored.push("Sector: sector data isn't loaded yet, so sector filters can't be applied");
  if (/\b(profitable|profitability|net income|earnings|revenue|margin|valuation|p\/?e|cheap|value stocks?)\b/i.test(text)) ignored.push("Profitability and valuation: fundamentals aren't loaded yet");
  if (/\b(small|mid|large|mega|micro)[- ]?caps?\b|\bmarket cap\b/i.test(text)) ignored.push("Market cap: not loaded yet (dollar volume is available as a liquidity filter)");
  if (!q) return ignored.length ? { href: "/scanner", params: {}, interpreted: [], ignored } : null;
  const url = new URLSearchParams(q.href.split("?")[1]);
  const params: Record<string, unknown> = { p_limit: 10 };
  const interpreted: { label: string; value: string }[] = [];
  let pi = 0;
  for (const [k, v] of url) {
    const rpc = SCAN_MAP[k];
    if (!rpc) continue;
    params[rpc] = k === "score" || k === "dv" ? Number(v) : v;
    if (k !== "sort") interpreted.push({ label: PARAM_LABEL[k], value: q.parts[pi++] ?? v });
    else interpreted.push({ label: PARAM_LABEL.sort, value: v === "confidence" ? "Pattern Confidence" : v === "zone" ? "closest to a Fib zone" : v });
  }
  if (!params.p_sort) params.p_sort = "dollar_volume";
  return { href: q.href, params, interpreted, ignored };
}

async function screener(b: Builder, tools: Tools, text: string): Promise<string> {
  const it = interpretScreen(text);
  if (!it || !it.interpreted.length) {
    b.add({ type: "screen", interpreted: [], ignored: it?.ignored ?? [], href: "/scanner", total: null, rows: [] });
    b.add({ type: "text", role: "note", text: "I couldn't turn that into scanner filters Viridia supports. Try structure (wave 3, wave 5, correction complete, near a Fib zone, near invalidation), trend, direction, confidence, 52-week highs or lows, stocks or ETFs, and liquidity such as \"$100M a day\"." });
    b.followups.push("Find wave 3 stocks near a Fib zone", "Find high confidence uptrends near 52-week highs", "Find ETFs near invalidation");
    return "Screen";
  }
  b.status("Running the scanner…");
  const rows = await b.tool("run_scanner", () => tools.scan(it.params), (v) => v.length) ?? [];
  const cite = b.cite("viridia_scanner", "Viridia scanner", `Filters: ${it.interpreted.map((x) => `${x.label} ${x.value}`).join("; ")}.`, day(rows[0]?.last_ts), it.href);
  b.add({
    type: "screen", interpreted: it.interpreted, ignored: it.ignored, href: it.href, total: rows[0]?.total ?? 0, cite,
    rows: rows.slice(0, 10).map((x) => {
      const r = x as unknown as Record<string, unknown>;
      return {
        symbol: x.symbol, name: x.name, price: px(x.close), change: pc(x.change_pct, 2),
        count: waveShort(r.glance_pattern as string, r.glance_complete as boolean, r.glance_wave as string, r.glance_wave_dir as string) ?? "—",
        score: r.glance_score != null ? String(r.glance_score) : "—", zone: r.zone_dist != null ? pc(r.zone_dist as number) : "—",
      };
    }),
  });
  if (it.ignored.length) b.missing.push("some requested filters");
  const top = rows.slice(0, 3).map((x) => x.symbol);
  if (top.length >= 2) b.followups.push(`Compare the top ${top.length === 3 ? "three" : "two"}`);
  if (top[0]) b.followups.push(`What does Viridia see in ${top[0]}?`);
  b.actions.push({ kind: "link", label: "Open in Scanner", href: it.href }, { kind: "link", label: "Edit filters", href: it.href });
  return `Screen · ${rows[0]?.total ?? 0} match${rows[0]?.total === 1 ? "" : "es"}`;
}

// ---------------------------------------------------------------- portfolio

async function portfolio(b: Builder, tools: Tools, text: string, id: string | null): Promise<string> {
  b.status("Loading your portfolio…");
  const p = await b.tool("get_portfolio", () => tools.portfolio(id));
  if (!p) {
    b.unavailable("a saved portfolio", "Sign in and save a portfolio in Portfolio X-Ray, or run an X-Ray and use its own Ask panel.");
    b.actions.push({ kind: "link", label: "Open Portfolio X-Ray", href: "/portfolio" });
    return "Portfolio";
  }
  const ws = p.ws;
  const cite = b.cite("viridia_portfolio", `${p.name} X-Ray`, "Computed from your saved holdings and stored end-of-day prices.", ws.asOf, `/portfolio?id=${p.id}`);
  const m = ws.metrics;
  b.add({
    type: "portfolio", name: p.name, href: `/portfolio?id=${p.id}`, cite,
    metrics: [
      { label: "Value", value: usdBig(m.value) }, { label: "Day", value: pc(m.dayPct, 2), tone: tone(m.dayPct) },
      { label: "Volatility", value: m.vol != null ? `${(m.vol * 100).toFixed(1)}%` : "—" }, { label: "Beta", value: m.beta != null ? m.beta.toFixed(2) : "—" },
      { label: "Top 5", value: `${(ws.concentration.top5 * 100).toFixed(1)}%` }, { label: "Independent exposures", value: ws.risk.enb != null ? ws.risk.enb.toFixed(1) : "—" },
    ],
    holdings: ws.risk.rows.slice(0, 6).map((r) => ({ symbol: r.symbol, weight: `${(r.weight * 100).toFixed(1)}%`, note: r.contribution != null ? `${(r.contribution * 100).toFixed(1)}% of risk` : "" })),
  });
  if (/\bearnings\b|\breport/i.test(text)) b.unavailable("earnings dates for holdings", FUNDAMENTALS_WHY);
  const a = portfolioAnswer(text, ws, null, null);
  b.add({ type: "text", role: "analysis", text: a.lines.join(" "), cite: [cite] });
  b.followups.push("What is driving portfolio risk?", "Which holdings behave similarly?", "Which positions are near structural invalidation?");
  b.actions.push({ kind: "link", label: "Open Portfolio X-Ray", href: `/portfolio?id=${p.id}${a.tab ? `#${a.tab}` : ""}` });
  return `${p.name}`;
}

// ---------------------------------------------------------------- market and macro

async function market(b: Builder, tools: Tools, text: string, depth: string): Promise<string> {
  b.status("Reading the market…");
  const ctx = await b.tool("get_market_regime", () => tools.market());
  if (!ctx) { b.unavailable("market data", "Market data didn't load. Try again in a minute."); return "Markets"; }
  const spy = ctx.pulse.find((r) => r.symbol === "SPY") ?? null;
  const reg = regime(ctx.breadth, spy);
  const asOf = day(spy?.last_ts);
  const c1 = b.cite("market_data", "Index ETF proxies", "SPY, QQQ, IWM and DIA end-of-day closes.", asOf, "/markets");
  const c2 = b.cite("viridia_regime", "Viridia market regime", "Share of measured securities in uptrends and downtrends, above the 50-day, near 52-week extremes.", day(ctx.breadth?.as_of), "/markets");
  const row = (s: string) => ctx.pulse.find((r) => r.symbol === s);
  const m = (s: string, label: string): Metric => { const r = row(s); const v = r ? returns(r).d1 : null; return { label, value: pc(v, 2), tone: tone(v), cite: c1 }; };
  b.add({
    type: "market", title: `Markets through ${asOf ?? "the last close"}`, cite: [c1, c2],
    metrics: [m("SPY", "S&P 500"), m("QQQ", "Nasdaq-100"), m("IWM", "Russell 2000"), m("DIA", "Dow"),
      ...(ctx.breadth ? [{ label: "Advancers / decliners", value: `${ctx.breadth.advancers.toLocaleString("en-US")} / ${ctx.breadth.decliners.toLocaleString("en-US")}`, cite: c2 }] : [])],
    lines: [reg.sentence, ...(ctx.gainer?.change_pct != null ? [`Largest gain among liquid names: ${ctx.gainer.symbol} ${pc(ctx.gainer.change_pct, 2)}; largest decline: ${ctx.loser?.symbol ?? "—"} ${pc(ctx.loser?.change_pct, 2)}.`] : [])],
  });
  if (/\bsemiconductor|\bchips?\b|\bsemis\b/i.test(text)) {
    const smh = await b.tool("get_security:SMH", () => tools.security("SMH"));
    if (smh) { securityBlock(b, smh, "professional"); b.reasons.push("Semiconductors are represented by the SMH ETF; sector membership for individual stocks isn't loaded."); }
  }
  const total = ctx.eventCounts.reduce((a, c) => a + c.n, 0);
  if (total) {
    const c3 = b.cite("viridia_events", "Viridia change detection", "Structural events on securities trading $25M+ a day.", ctx.eventCounts[0]?.day, "/terminal#changes");
    b.add({ type: "events", title: `Viridia changes (${total.toLocaleString("en-US")} on liquid names)`, cite: c3, items: ctx.changeEvents.slice(0, depth === "deep" ? 10 : 6).map((e) => ({ symbol: e.symbol, day: e.day, text: eventSentence(e), tone: eventTone(e) })) });
  }
  if (/\bwhy\b/i.test(text)) b.unavailable("news and economic releases", "Viridia doesn't hold news, so it can describe what moved but not attribute the cause.");
  b.followups.push("Show stocks near Fibonacci confluence", "What changed in Viridia's signals?", "Why are Treasury ETF proxies moving?");
  b.actions.push({ kind: "link", label: "Open Mission Control", href: "/terminal" });
  void REGIME_LABEL;
  return "Market update";
}

async function macro(b: Builder, tools: Tools, r: Route, aud: Audience): Promise<string> {
  const c = r.conceptId ? CONCEPTS.find((x) => x.id === r.conceptId) : null;
  if (c) b.add({ type: "definition", term: c.title, text: c.text[aud], formula: aud === "client" ? undefined : c.formula });
  const ctx = await b.tool("get_market_regime", () => tools.market());
  if (ctx) {
    const row = (s: string) => ctx.pulse.find((x) => x.symbol === s) as PulseRow | undefined;
    const asOf = day(row("SPY")?.last_ts);
    const cite = b.cite("market_data", "Treasury and macro ETF proxies", "SHY, IEF, TLT, UUP, GLD, USO and IBIT end-of-day closes. ETF prices, not yields.", asOf, "/terminal");
    const mm = (s: string, label: string): Metric => { const x = row(s); const rr = x ? returns(x) : null; return { label, value: rr ? `${pc(rr.d1, 2)} day · ${pc(rr.w1)} wk` : "—", tone: tone(rr?.w1), cite }; };
    b.add({ type: "market", title: "Treasury and macro proxies", cite: [cite],
      metrics: [mm("SHY", "SHY (1–3y Treasuries)"), mm("IEF", "IEF (7–10y)"), mm("TLT", "TLT (20y+)"), mm("UUP", "Dollar (UUP)"), mm("GLD", "Gold (GLD)"), mm("USO", "Oil (USO)")],
      lines: ["These are ETF prices, not yields: Treasury ETF prices fall when yields rise."] });
  }
  b.unavailable("Treasury yields and economic data (CPI, GDP, Fed decisions)", "Viridia doesn't load yield curves or economic releases yet, so it shows ETF proxies instead of the yields themselves.");
  b.followups.push("Explain duration", "Explain the yield curve", "What happened to the market today?");
  return c ? c.title : "Rates and macro";
}

// ---------------------------------------------------------------- actions and fallbacks

function watchAction(b: Builder, syms: string[], text: string): string {
  if (!syms.length) { b.add({ type: "text", role: "note", text: "Which securities should I add? Name them by ticker, for example: add NVDA and AMD to my watchlist." }); return "Watchlist"; }
  const named = text.match(/\bto (?:my |the )?([A-Za-z0-9 &'-]{2,40}?) watch ?list\b/i)?.[1]?.trim();
  if (named && !/^my$/i.test(named)) b.add({ type: "text", role: "note", text: `Viridia keeps one watchlist per account, so these go to your watchlist rather than a separate "${named}" list.` });
  b.add({ type: "text", role: "note", text: `Ready to add ${syms.join(", ")} to your watchlist. Confirm below.` });
  b.actions.push({ kind: "watch", label: `Add ${syms.join(", ")}`, symbols: syms });
  return "Add to watchlist";
}

function unknownAnswer(b: Builder, r: Route, q: string): string {
  const c = findConcept(q);
  if (c) return educationSync(b, c);
  b.add({ type: "text", role: "note", text: "I don't have enough information to answer that from Viridia's data or its financial reference yet. I can explain financial concepts, research covered securities (price, trend and Viridia structure), compare them, screen the market, summarize market conditions and analyze a saved portfolio." });
  if (/\b(price target|analyst|estimate|consensus|rating)\b/i.test(q)) b.unavailable("analyst estimates and price targets", FUNDAMENTALS_WHY);
  if (/\bshould i (buy|sell)\b|\bis it a (buy|sell)\b/i.test(q)) b.add({ type: "text", role: "note", text: "Viridia doesn't make buy or sell recommendations. It can show the structure, the evidence behind it and the level that would invalidate it." });
  b.followups.push("What is Viridia seeing in SPY?", "Find stocks near Fibonacci confluence", "Explain free cash flow yield", "What happened to the market today?");
  void r;
  return "Ask Viridia";
}

function educationSync(b: Builder, c: Concept): string {
  b.add({ type: "definition", term: c.title, text: c.text.professional, formula: c.formula });
  return c.title;
}

// ---------------------------------------------------------------- model interpretation guard

const SYSTEM = (aud: Audience) => `You are Ask Viridia, the research copilot in Viridia Terminal.
Write a short INTERPRETATION (2 to 4 sentences) of the evidence for a ${aud === "client" ? "client with no finance background: plain language, no jargon, no Elliott Wave terms" : aud === "beginner" ? "beginner: plain language" : aud === "technical" ? "technical professional" : "financial professional"}.
Rules: use only facts and numbers present in the evidence JSON; do not introduce any number that is not in it. Never give buy or sell advice, never predict prices, never express certainty; describe scenarios, evidence, risk and invalidation. If the evidence says something is unavailable, don't fill the gap. No headings, no bullet points, no preamble.`;

/** Every number in the model's text must already appear in the evidence (small counts excepted). */
export function validateNumbers(text: string, evidence: string): boolean {
  const norm = (s: string) => s.replace(/[$,%]/g, "").replace(/−/g, "-");
  const ev = norm(evidence);
  const nums = norm(text).match(/-?\d+(?:\.\d+)?/g) ?? [];
  return nums.every((n) => {
    const v = Math.abs(Number(n));
    if (Number.isInteger(v) && v <= 12) return true;
    const bare = n.replace(/^-/, "");
    return ev.includes(bare);
  });
}
