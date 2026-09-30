/**
 * Ask Viridia: shared types for the research copilot. Answers are built from typed blocks (not free
 * Markdown) so each kind of result renders as its own component, and every figure in a block can be
 * traced to a citation.
 */

export type Intent =
  | "FINANCIAL_EDUCATION" | "COMPANY_RESEARCH" | "MARKET_RESEARCH" | "VIRIDIA_STRUCTURE" | "TECHNICAL_ANALYSIS"
  | "FUNDAMENTAL_ANALYSIS" | "VALUATION" | "EARNINGS" | "FILINGS" | "PORTFOLIO_ANALYSIS" | "SCREENER_QUERY"
  | "COMPARISON" | "MACROECONOMICS" | "CLIENT_EXPLANATION" | "GENERAL_FINANCE" | "WATCHLIST_ACTION" | "UNKNOWN";

export type Audience = "professional" | "client" | "beginner" | "technical";
export type Depth = "quick" | "research" | "deep";
export type Evidence = "strong" | "moderate" | "limited" | "conflicting" | "insufficient";

export const AUDIENCE_LABEL: Record<Audience, string> = { professional: "Professional", client: "Client", beginner: "Beginner", technical: "Technical" };
export const DEPTH_LABEL: Record<Depth, string> = { quick: "Quick", research: "Research", deep: "Deep research" };
export const EVIDENCE_LABEL: Record<Evidence, string> = {
  strong: "Strong evidence", moderate: "Moderate evidence", limited: "Limited evidence", conflicting: "Conflicting evidence", insufficient: "Insufficient data",
};

/** What the page the question was asked from is showing. */
export interface PageContext {
  path?: string | null;
  symbol?: string | null;
  degree?: string | null;
  timeframe?: string | null;
  zone?: { low: number; high: number } | null;
  candidate?: string | null;
  portfolioId?: string | null;
  scanner?: string | null;
  watchlist?: boolean;
}

export interface AskRequest {
  q: string;
  context?: PageContext;
  audience?: Audience;
  depth?: Depth;
  /** Tickers the selected workspace or conversation has discussed (scoped memory). */
  entities?: string[];
  /** The last answer's symbols in order, for "the top three", "both", "them". */
  last?: string[];
  useContext?: boolean;
}

export type CitationKind = "market_data" | "viridia_engine" | "viridia_scanner" | "viridia_events" | "viridia_portfolio" | "viridia_regime" | "glossary" | "user_data";
export const CITATION_LABEL: Record<CitationKind, string> = {
  market_data: "Market data", viridia_engine: "Viridia structure engine", viridia_scanner: "Viridia scanner", viridia_events: "Viridia change detection",
  viridia_portfolio: "Viridia portfolio calculation", viridia_regime: "Viridia market regime", glossary: "Viridia reference", user_data: "Your data",
};
export interface Citation { id: number; kind: CitationKind; title: string; detail: string; asOf?: string | null; href?: string }

export interface Metric { label: string; value: string; tone?: "pos" | "neg" | "warn"; cite?: number }

export type Block =
  | { type: "text"; role: "fact" | "analysis" | "interpretation" | "note"; text: string; cite?: number[] }
  | { type: "definition"; term: string; text: string; formula?: string; example?: string; related?: string[] }
  | { type: "calculation"; title: string; inputs: { label: string; value: string }[]; formula: string; result: string }
  | { type: "security"; symbol: string; name: string; price: string | null; change: string | null; tone?: "pos" | "neg"; metrics: Metric[]; asOf: string | null; cite?: number }
  | { type: "structure"; symbol: string; rows: { label: string; value: string; note?: string }[]; means: string[]; strengthen: string[]; weaken: string[]; monitor: string[]; cite?: number }
  | { type: "fibzones"; symbol: string; close: number | null; zones: { low: number; high: number; dist: number; count: number; strength: number; levels: string[] }[]; cite?: number }
  | { type: "comparison"; symbols: string[]; sections: { title: string; rows: { label: string; values: string[] }[] }[]; differences: string[]; cite?: number[] }
  | { type: "screen"; interpreted: { label: string; value: string }[]; ignored: string[]; href: string; total: number | null; rows: { symbol: string; name: string; price: string; change: string; count: string; score: string; zone: string }[]; cite?: number }
  | { type: "portfolio"; name: string; metrics: Metric[]; holdings: { symbol: string; weight: string; note: string }[]; href: string; cite?: number }
  | { type: "market"; title: string; metrics: Metric[]; lines: string[]; cite?: number[] }
  | { type: "events"; title: string; items: { symbol?: string; day: string; text: string; tone?: "pos" | "neg" | "neutral" }[]; cite?: number }
  | { type: "unavailable"; what: string; why: string }
  | { type: "actions"; items: Action[] };

export type Action =
  | { kind: "link"; label: string; href: string }
  | { kind: "ask"; label: string; q: string }
  | { kind: "watch"; label: string; symbols: string[] };

export interface TraceEntry { tool: string; ms: number; ok: boolean; rows?: number; error?: string }
export interface Trace { intent: Intent; symbols: string[]; tools: TraceEntry[]; sources: string[]; dataAsOf: string | null; ms: number; llm: { used: boolean; model?: string; tokensIn?: number; tokensOut?: number; rejected?: boolean } }

export interface Answer {
  intent: Intent;
  title: string;
  blocks: Block[];
  citations: Citation[];
  evidence: { state: Evidence; reasons: string[] };
  followups: string[];
  symbols: string[];
  trace: Trace;
}

/** Streamed to the client as NDJSON, one event per line. */
export type AskEvent =
  | { type: "status"; text: string }
  | { type: "intent"; intent: Intent; symbols: string[] }
  | { type: "block"; block: Block }
  | { type: "text"; delta: string }
  | { type: "done"; answer: Answer }
  | { type: "error"; text: string };
