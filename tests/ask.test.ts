import { describe, expect, it } from "vitest";
import { route } from "../src/lib/ask/router";
import { interpretScreen, runAsk, validateNumbers, type Llm } from "../src/lib/ask/engine";
import { CONCEPTS, findConcept } from "../src/lib/ask/glossary";
import type { Tools } from "../src/lib/ask/tools";
import type { AskEvent, AskRequest, Block } from "../src/lib/ask/types";
import type { SecurityPreview } from "../src/lib/analysis/mission";

const KNOWN = ["NVDA", "AMD", "QCOM", "IREN", "SPY", "SMH", "AVGO"];
const preview = (symbol: string, close = 100): SecurityPreview => ({
  id: 1, symbol, name: `${symbol} Inc.`, exchange: "XNAS", asset_type: "stock", close, prev_close: close * 0.98, close_5: close * 0.95, close_21: close * 0.9,
  last_ts: "2026-09-28T00:00:00Z", trend: symbol === "AMD" ? "mixed" : "uptrend", sma50: close * 0.95, sma200: close * 0.85, high_52w: close * 1.1, low_52w: close * 0.6, adv20: 5e9, spark: [],
  daily: { degree: "intermediate", pattern: "impulse", complete: false, wave: "3", wave_dir: "up", score: 72, alt_score: symbol === "QCOM" ? 70 : 60, hold: close * 0.9, hold_side: "below", target: close * 1.2 },
  weekly: { pattern: "impulse", complete: false, wave: "3", wave_dir: symbol === "AMD" ? "down" : "up", score: 65 },
  setup: null, zone: null, setup_check: { flags: [], atr: 2, analysis_ts: "2026-09-28T00:00:00Z", last_ts: "2026-09-28T00:00:00Z", split: false }, history: [],
});
const calls: string[] = [];
const tools: Tools = {
  async resolveSymbols(t) { calls.push("resolve"); return t.filter((x) => KNOWN.includes(x)).map((symbol) => ({ symbol, name: symbol, asset_subtype: "common" })); },
  async security(s) { calls.push(`security:${s}`); return KNOWN.includes(s) ? preview(s) : null; },
  async structure(s) {
    calls.push(`structure:${s}`);
    return { swing: { primary: "higher_highs_lows", intermediate: "higher_highs_lows", minor: "expanding" }, candidates: 12, analysis_ts: "2026-09-28T00:00:00Z", close_call: s === "QCOM",
      zones: [{ low: 110, high: 112, mid: 111, side: "above", count: 3, strength: 3.4, distancePct: 0.11, degrees: ["minor"], levels: [{ label: "Wave 3 = 161.8% of wave 1", price: 111, degree: "minor", kind: "projection" }] }] };
  },
  async events() { calls.push("events"); return []; },
  async market() { calls.push("market"); return null; },
  async scan(p) { calls.push(`scan:${JSON.stringify(p)}`); return [{ symbol: "NVDA", name: "NVIDIA", exchange: "XNAS", asset_subtype: "common", close: 100, change_pct: 0.02, trend: "uptrend", vs_sma50: 0.05, vs_sma200: 0.2, from_high: -0.05, range_pos: 0.9, dollar_volume: 1e10, last_ts: "2026-09-28T00:00:00Z", total: 17 }]; },
  async watchlist() { return null; },
  async portfolio() { calls.push("portfolio"); return null; },
};
async function ask(q: string, extra: Partial<AskRequest> = {}) {
  calls.length = 0;
  const events: AskEvent[] = [];
  const a = await runAsk({ q, ...extra }, tools, (e) => events.push(e));
  return { a, events, types: a.blocks.map((b) => b.type), calls: [...calls] };
}
const text = (bs: Block[]) => JSON.stringify(bs);

describe("Ask Viridia router", () => {
  it("routes education without live data and structure questions to the engine", () => {
    expect(route("What is EBITDA?").intent).toBe("FINANCIAL_EDUCATION");
    expect(route("What is duration?").needsLive).toBe(false);
    expect(route("What is P/E?").intent).toBe("FINANCIAL_EDUCATION");
    expect(route("What is QCOM's current wave structure?").intent).toBe("VIRIDIA_STRUCTURE");
    expect(route("What is NVDA's P/E?").intent).toBe("VALUATION");
    expect(route("Compare AMD and NVDA").intent).toBe("COMPARISON");
    expect(route("Find semiconductors near Fib confluence").intent).toBe("SCREENER_QUERY");
    expect(route("Where is my portfolio concentrated?").intent).toBe("PORTFOLIO_ANALYSIS");
    expect(route("Why did stocks fall today?").intent).toBe("MARKET_RESEARCH");
    expect(route("Why are Treasury yields rising?").intent).toBe("MACROECONOMICS");
    expect(route("Add NVDA and AMD to my AI Infrastructure watchlist").intent).toBe("WATCHLIST_ACTION");
    expect(route("/compare nvda amd").tokens).toEqual(["NVDA", "AMD"]);
  });
  it("resolves page context, the last answer and the workspace", () => {
    const r = route("What would invalidate this?", { symbol: "NVDA" });
    expect(r.implied).toEqual(["NVDA"]);
    expect(r.intent).toBe("VIRIDIA_STRUCTURE");
    expect(route("Is this expensive?", { symbol: "NVDA" }).intent).toBe("VALUATION");
    expect(route("Compare the top three", {}, ["NVDA", "AMD", "AVGO", "MU"]).implied).toEqual(["NVDA", "AMD", "AVGO"]);
    expect(route("Which one has improved the most since our last review?", {}, [], ["NVDA", "IREN"]).implied).toEqual(["NVDA", "IREN"]);
    expect(route("What would invalidate this?", { symbol: "NVDA" }, [], [], false).implied).toEqual([]);
  });
  it("doesn't mistake finance words for tickers", () => {
    expect(route("tell me about beta").tokens).toEqual([]);
    expect(route("Explain a Roth conversion.").intent).toBe("FINANCIAL_EDUCATION");
    expect(findConcept("What does an inverted yield curve mean?")?.id).toBe("yield_curve");
    expect(findConcept("what is EV/EBITDA")?.id).toBe("ev_ebitda");
    for (const c of CONCEPTS) for (const a of ["professional", "client", "beginner", "technical"] as const) expect(c.text[a].length).toBeGreaterThan(20);
  });
});

describe("Ask Viridia answers", () => {
  it("answers education from the reference library with a calculation and no data tools", async () => {
    const { a, calls: c } = await ask("What is free cash flow yield?", { audience: "technical" });
    expect(a.intent).toBe("FINANCIAL_EDUCATION");
    expect(a.blocks[0].type).toBe("definition");
    expect(a.blocks.some((b) => b.type === "calculation")).toBe(true);
    expect(c.filter((x) => x !== "resolve")).toEqual([]);
    expect(a.evidence.state).toBe("strong");
  });
  it("researches a company with a security card, structure, zones and the fundamentals gap stated", async () => {
    const { a, types } = await ask("Tell me about NVDA");
    expect(a.intent).toBe("COMPANY_RESEARCH");
    expect(types).toEqual(expect.arrayContaining(["security", "structure", "fibzones", "unavailable"]));
    expect(a.citations.map((c) => c.kind)).toEqual(expect.arrayContaining(["market_data", "viridia_engine"]));
    expect(a.followups.length).toBeGreaterThanOrEqual(2);
    expect(a.evidence.state).toBe("moderate");
  });
  it("says when counts are close instead of presenting one as settled", async () => {
    const { a } = await ask("What does Viridia see in QCOM?");
    expect(a.intent).toBe("VIRIDIA_STRUCTURE");
    expect(text(a.blocks)).toMatch(/not well separated/);
    expect(a.evidence.state).toBe("conflicting");
  });
  it("uses the page's security for 'this'", async () => {
    const { a } = await ask("What would invalidate this?", { context: { symbol: "IREN" } });
    expect(a.symbols).toEqual(["IREN"]);
    expect(text(a.blocks)).toMatch(/invalidates the preferred count/);
  });
  it("compares without declaring a winner and flags missing fundamentals", async () => {
    const { a } = await ask("Compare AMD and NVDA");
    const cmp = a.blocks.find((b) => b.type === "comparison") as Extract<Block, { type: "comparison" }>;
    expect(cmp.symbols).toEqual(["AMD", "NVDA"]);
    expect(cmp.differences.join(" ")).toMatch(/doesn't rank/);
    expect(a.blocks.some((b) => b.type === "unavailable")).toBe(true);
  });
  it("shows how a screen was interpreted and which requested filters it couldn't apply", async () => {
    const it2 = interpretScreen("Find semiconductors near Fib confluence")!;
    expect(it2.ignored.join(" ")).toMatch(/Sector/);
    expect(it2.params.p_structure).toBe("near_zone");
    const { a } = await ask("Find semiconductors near Fib confluence");
    const sc = a.blocks.find((b) => b.type === "screen") as Extract<Block, { type: "screen" }>;
    expect(sc.total).toBe(17);
    expect(sc.interpreted.length).toBeGreaterThan(0);
  });
  it("handles missing data honestly", async () => {
    const { a } = await ask("What is the analyst price target for XYZ?");
    expect(text(a.blocks)).toMatch(/aren't loaded|don't have enough information/);
    expect(a.evidence.state).toBe("insufficient");
    const p = await ask("Where is my portfolio concentrated?");
    expect(p.a.blocks[0].type).toBe("unavailable");
    const m = await ask("Why did stocks fall today?");
    expect(m.a.blocks.some((b) => b.type === "unavailable")).toBe(true);
  });
  it("prepares a watchlist action for confirmation instead of acting on its own", async () => {
    const { a } = await ask("Add NVDA and AMD to my AI Infrastructure watchlist");
    const act = a.blocks.find((b) => b.type === "actions") as Extract<Block, { type: "actions" }>;
    expect(act.items[0]).toMatchObject({ kind: "watch", symbols: ["NVDA", "AMD"] });
    expect(text(a.blocks)).toMatch(/one watchlist/);
  });
  it("switches to client language on request", async () => {
    const { a } = await ask("Explain this to a client", { context: { symbol: "NVDA" } });
    expect(text(a.blocks)).toMatch(/not a forecast/);
    expect(text(a.blocks)).not.toMatch(/Pattern Confidence 72 \(fit/);
  });
  it("only shows a model interpretation whose numbers are all in the evidence", async () => {
    expect(validateNumbers("Price sits 11.0% below the zone.", '{"v":"11.0%"}')).toBe(true);
    expect(validateNumbers("Revenue grew 21% last year.", '{"v":"11.0%"}')).toBe(false);
    const fake = (out: string): Llm => ({ model: "test", async stream(_s, _u, d) { d(out); return { text: out, tokensIn: 1, tokensOut: 1 }; } });
    calls.length = 0;
    const good = await runAsk({ q: "Tell me about NVDA" }, tools, () => {}, fake("The structure is constructive while price holds above the invalidation."));
    expect(good.blocks.some((b) => b.type === "text" && b.role === "interpretation")).toBe(true);
    const bad = await runAsk({ q: "Tell me about NVDA" }, tools, () => {}, fake("Revenue grew 37.4% year over year."));
    expect(bad.blocks.some((b) => b.type === "text" && b.role === "interpretation")).toBe(false);
    expect(bad.trace.llm.rejected).toBe(true);
  });
});
