/**
 * Ask Viridia's query router: what kind of question this is, which securities it's about (typed,
 * implied by the page, or carried from the conversation), and whether it needs live data. Pure and
 * deterministic, so the same question always routes the same way and the routing is testable.
 */
import { findConcept } from "./glossary";
import type { Intent, PageContext } from "./types";

export interface Route {
  intent: Intent;
  /** Candidate tickers typed in the question (to be checked against the security master). */
  tokens: string[];
  /** Symbols implied rather than typed: the page's security, the last answer's list, the workspace. */
  implied: string[];
  impliedFrom: "page" | "last" | "workspace" | null;
  slash: string | null;
  /** The question with any slash command removed. */
  text: string;
  needsLive: boolean;
  conceptId: string | null;
  /** How many of the last answer's securities the question refers to ("the top three"). */
  take: number | null;
}

// words that look like tickers but almost never are, in questions
const STOP = new Set(("A I AM AN AND ARE AS AT BE BUT BY DO FOR FROM HAS HAVE HOW IF IN IS IT ITS ME MY NO NOT OF ON OR OUR SO THE TO UP US WAS WE WHAT WHEN WHERE WHICH WHO WHY WILL WITH YOU YOUR " +
  "ETF ETFS IRA IRAS ROTH EPS EBIT EBITDA FCF PE EV GDP CPI FED FOMC SEC USA US AI ATH YTD YOY QOQ TTM CEO CFO IPO RMD RMDS DCA ROI ROE ROA NAV API " +
  "BUY SELL LONG SHORT HOLD CALL PUT BULL BEAR TODAY WEEK MONTH YEAR RATE RATES BOND BONDS STOCK STOCKS FUND FUNDS CASH DEBT RISK MEAN SHOW FIND LIST TELL GIVE EXPLAIN COMPARE WAVE FIB ZONE ZONES THIS THAT THESE THOSE ONE TWO BOTH ALL ANY SOME NEAR TOP BEST").split(" "));

const SLASH = /^\/(research|compare|screen|structure|portfolio|explain)\b\s*/i;

/**
 * Tickers typed in a question: $TICKER, all-caps tokens of two or more letters, or lower-case tokens
 * right after a cue word. Lower-case ones are "soft": a finance term that happens to be a ticker
 * ("tell me about beta") loses to the glossary.
 */
export function tickerTokens(q: string): { tokens: string[]; soft: Set<string> } {
  const out: string[] = [];
  const soft = new Set<string>();
  const push = (t: string, isSoft = false) => {
    const u = t.toUpperCase();
    if (STOP.has(u) || !/^[A-Z][A-Z0-9.\-]{0,5}$/.test(u)) return;
    if (!out.includes(u)) { out.push(u); if (isSoft) soft.add(u); } else if (!isSoft) soft.delete(u);
  };
  for (const m of q.matchAll(/\$([A-Za-z][A-Za-z0-9.\-]{0,5})\b/g)) push(m[1]);
  for (const m of q.matchAll(/(?<![\/\w])([A-Z][A-Z0-9]{1,4}(?:\.[A-Z])?)(?![\/\w])/g)) push(m[1]);
  // lower-case tickers after cue words: "compare nvda and amd", "what does viridia see in iren"
  const cue = /\b(?:about|in|on|for|of|compare|vs\.?|versus|and|research|structure|analy[sz]e)\s+([a-z][a-z0-9]{1,4})\b/g;
  for (const m of q.matchAll(cue)) push(m[1], true);
  if (/^\/(research|compare|structure)\b/i.test(q)) for (const m of q.replace(SLASH, "").matchAll(/\b([A-Za-z][A-Za-z0-9.\-]{0,5})\b/g)) push(m[1]);
  return { tokens: out, soft };
}

const RX = {
  watch: /\b(add|put|save)\b.*\bwatch ?list\b|\bwatch ?list\b.*\badd\b/i,
  client: /\b(explain|say|put)\b.*\b(like|to|for) (a |my )?client|\bclient[- ]friendly\b|\bexplain (it|this|that) simply\b/i,
  compare: /\bcompare\b|\bvs\.?\b|\bversus\b|\bdifference between\b/i,
  screen: /\b(find|screen|scan|list|show me|which (stocks|securities|etfs|ones|names))\b|\bstocks (in|near|with|that)\b/i,
  portfolio: /\b(my|this|the) (portfolio|holdings|positions)\b|\bportfolio\b|\bconcentrat|\boverlap/i,
  valuation: /\bvaluation\b|\bmultiples?\b|\bexpensive\b|\bcheap\b|\bovervalued\b|\bundervalued\b|\bp\s*\/?\s*e\b|\bev\s*\/\s*ebitda\b|\bprice target\b|\bfcf yield\b/i,
  earnings: /\bearnings\b|\beps\b|\bguidance\b|\bquarter(ly)? results\b|\breport(s|ed)?\b.*\b(soon|date|next)\b/i,
  filings: /\b10-?[kq]\b|\b8-?k\b|\bfiling|\bproxy statement\b|\bsec\b/i,
  fundamentals: /\brevenue|\bmargin|\bcash flow|\bprofit|\bbalance sheet|\bdebt\b|\bsales growth\b|\bfinancials\b|\bbusiness\b/i,
  structure: /\bwaves?\b|\bstructure\b|\binvalidat|\bfib(onacci)?\b|\bcounts?\b|\belliott\b|\bviridia (see|think|say)|\bwhat does viridia\b|\bsetups?\b|\bscenario|\bzones?\b|\bconfluence\b|\bpattern\b/i,
  technical: /\btrend\b|\bmoving average|\b(50|200)[- ]day\b|\bmomentum\b|\bsupport\b|\bresistance\b|\brsi\b|\b52[- ]?w(ee)?k|\bbreakout\b/i,
  market: /\bmarkets?\b|\bstocks (fall|fell|rise|rose|rally|rallied|drop|dropped)\b|\btoday\b|\bthis week\b|\bbreadth\b|\bregime\b|\bsectors?\b|\bs&p\b|\bnasdaq\b|\bsemiconductor|\bwhat changed\b|\bmovers?\b/i,
  macro: /\byield curve\b|\btreasur|\byields?\b|\binterest rates?\b|\brates\b|\binflation\b|\bthe fed\b|\bfed\b|\bcpi\b|\bgdp\b|\brecession\b|\bdollar\b|\boil\b|\bgold\b|\bbitcoin\b/i,
  learn: /^(what is|what's|what are|whats|explain|define|how does|how do|how is|meaning of|what does .* mean|tell me about (a|an|the) )/i,
  pronoun: /\b(this|it|its|it's|this (stock|security|company|name|one|chart|count|zone)|here)\b/i,
  many: /\b(the )?top (two|three|four|five|2|3|4|5)\b|\b(them|these|those|both|all of them)\b/i,
  whichOne: /\bwhich (one|of (them|these))\b|\bour (last )?review\b/i,
};

const NUM: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, "2": 2, "3": 3, "4": 4, "5": 5 };

export function route(qRaw: string, ctx: PageContext = {}, last: string[] = [], entities: string[] = [], useContext = true): Route {
  const q = qRaw.trim();
  const sm = q.match(SLASH);
  const slash = sm ? sm[1].toLowerCase() : null;
  const text = sm ? q.replace(SLASH, "") : q;
  const tt = tickerTokens(q);
  const concept = findConcept(text);
  // a finance term typed in lower case is a question about the term, not a ticker
  const tokens = concept && !slash ? tt.tokens.filter((t) => !tt.soft.has(t)) : tt.tokens;

  let implied: string[] = [];
  let impliedFrom: Route["impliedFrom"] = null;
  let take: number | null = null;
  const many = text.match(RX.many);
  if (!tokens.length) {
    if (many && last.length) {
      const n = many[2] ? NUM[many[2].toLowerCase()] : null;
      take = n ?? (/\bboth\b/i.test(text) ? 2 : last.length);
      implied = last.slice(0, take); impliedFrom = "last";
    } else if (RX.whichOne.test(text) && entities.length) {
      implied = entities.slice(0, 8); impliedFrom = "workspace";
    } else if (useContext && ctx.symbol && (RX.pronoun.test(text) || (!concept && (RX.structure.test(text) || RX.valuation.test(text) || RX.fundamentals.test(text) || RX.earnings.test(text) || RX.technical.test(text))))) {
      implied = [ctx.symbol]; impliedFrom = "page";
    } else if (last.length === 1 && RX.pronoun.test(text)) {
      implied = [last[0]]; impliedFrom = "last";
    }
  }
  const nSym = tokens.length + implied.length;
  const has = nSym > 0;

  const pick = (): Intent => {
    if (slash === "compare") return "COMPARISON";
    if (slash === "screen") return "SCREENER_QUERY";
    if (slash === "structure") return "VIRIDIA_STRUCTURE";
    if (slash === "portfolio") return "PORTFOLIO_ANALYSIS";
    if (slash === "explain") return concept ? "FINANCIAL_EDUCATION" : "GENERAL_FINANCE";
    if (slash === "research") return "COMPANY_RESEARCH";
    if (RX.watch.test(text)) return "WATCHLIST_ACTION";
    if (RX.client.test(text)) return "CLIENT_EXPLANATION";
    if (RX.compare.test(text) && nSym >= 2) return "COMPARISON";
    if (RX.screen.test(text) && !(tokens.length === 1 && !/\bstocks|etfs|securities|ones|names\b/i.test(text))) return "SCREENER_QUERY";
    if (RX.portfolio.test(text) && !tokens.length) return "PORTFOLIO_ANALYSIS";
    if (has) {
      if (RX.valuation.test(text)) return "VALUATION";
      if (RX.earnings.test(text)) return "EARNINGS";
      if (RX.filings.test(text)) return "FILINGS";
      if (RX.structure.test(text)) return "VIRIDIA_STRUCTURE";
      if (RX.fundamentals.test(text)) return "FUNDAMENTAL_ANALYSIS";
      if (RX.technical.test(text)) return "TECHNICAL_ANALYSIS";
      if (nSym >= 2 && /\band\b|,/.test(text)) return "COMPARISON";
      return "COMPANY_RESEARCH";
    }
    if (concept && (RX.learn.test(text) || text.split(/\s+/).length <= 6)) return "FINANCIAL_EDUCATION";
    if (RX.macro.test(text)) return "MACROECONOMICS";
    if (RX.market.test(text)) return "MARKET_RESEARCH";
    if (concept) return "FINANCIAL_EDUCATION";
    if (RX.structure.test(text) && RX.screen.test(text)) return "SCREENER_QUERY";
    if (RX.valuation.test(text) || RX.earnings.test(text)) return "UNKNOWN";
    return RX.learn.test(text) ? "GENERAL_FINANCE" : "UNKNOWN";
  };
  const intent = pick();
  const needsLive = !["FINANCIAL_EDUCATION", "GENERAL_FINANCE", "UNKNOWN"].includes(intent);
  return { intent, tokens, implied, impliedFrom, slash, text, needsLive, conceptId: concept?.id ?? null, take };
}
