/**
 * Natural-language scanner queries for the command bar, parsed deterministically into the Wave
 * Scanner's URL filters: "wave 3 stocks near a fib zone in an uptrend over $100M". Only filters the
 * scanner actually supports are recognized; anything else is ignored rather than guessed.
 */
export interface ScanQuery { href: string; parts: string[] }

const STRUCTURE: [RegExp, string, string][] = [
  [/\bnear (an? )?invalidation\b|\bclose to invalidation\b/, "near_invalidation", "near invalidation"],
  [/\bwave ?3\b|\bthird wave\b/, "wave3", "wave 3"],
  [/\bwave ?5\b|\bfifth wave\b/, "wave5", "wave 5"],
  [/\bwave ?c\b/, "wave_c", "wave C"],
  [/\b(correction|abc|zigzag|flat)s? (complete|completed|done|finished)\b|\bcompleted? corrections?\b/, "abc_done", "correction complete"],
  [/\b(five|5)[- ]waves? (complete|completed|done)\b|\bcompleted? impulses?\b/, "five_done", "five waves complete"],
  [/\b(near|at|in) (an? |the )?(fib|fibonacci)( confluence)?( zones?)?\b|\bconfluence\b/, "near_zone", "near a Fib zone"],
];

export function parseScanQuery(input: string): ScanQuery | null {
  const t = ` ${input.toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ")} `;
  const p = new URLSearchParams();
  const parts: string[] = [];
  let structure: string | null = null;
  for (const [re, key, label] of STRUCTURE) {
    if (re.test(t)) {
      if (!structure) { structure = key; p.set("s", key); parts.push(label); }
      else if (key === "near_zone") { p.set("sort", "zone"); parts.push("closest to a Fib zone"); }
    }
  }
  if (/\b(uptrend|up ?trend)s?\b/.test(t)) { p.set("trend", "uptrend"); parts.push("uptrend"); }
  else if (/\b(downtrend|down ?trend)s?\b/.test(t)) { p.set("trend", "downtrend"); parts.push("downtrend"); }
  if (/\b(bullish|pointing up|upside|long)\b/.test(t)) { p.set("dir", "up"); parts.push("expects up"); }
  else if (/\b(bearish|pointing down|downside|short)\b/.test(t)) { p.set("dir", "down"); parts.push("expects down"); }
  if (/\bhigh(est)? confidence\b|\bstrong (structure|counts?)\b/.test(t)) { p.set("score", "70"); parts.push("confidence 70+"); }
  else if (/\bmedium confidence\b/.test(t)) { p.set("score", "58"); parts.push("confidence 58+"); }
  if (/\b(near|at|close to) (the |a )?(52[- ]?w(ee)?k?|yearly|annual) highs?\b|\bnew highs?\b/.test(t)) { p.set("near", "high"); parts.push("near 52-week high"); }
  else if (/\b(near|at|close to) (the |a )?(52[- ]?w(ee)?k?|yearly|annual) lows?\b|\bnew lows?\b/.test(t)) { p.set("near", "low"); parts.push("near 52-week low"); }
  if (/\betfs?\b|\bfunds?\b/.test(t)) { p.set("type", "etf"); parts.push("ETFs"); }
  else if (/\bstocks?\b|\bequities\b|\bshares\b/.test(t) && p.size) { p.set("type", "common"); parts.push("stocks"); }
  const dv = t.match(/\$ ?(\d+(?:\.\d+)?) ?(b|bn|billion|m|mm|million)\b/);
  if (dv) {
    const v = Number(dv[1]) * (/^b/.test(dv[2]) ? 1e9 : 1e6);
    const step = [1e9, 1e8, 2.5e7, 5e6].find((s) => v >= s);
    if (step) { p.set("dv", String(step)); parts.push(`$${step >= 1e9 ? "1B" : `${step / 1e6}M`}+ a day`); }
  } else if (/\bliquid\b|\bmost traded\b/.test(t)) { p.set("dv", "25000000"); parts.push("$25M+ a day"); }
  if (!p.size || (p.size === 1 && p.has("type"))) return null;
  if (!p.has("sort") && (p.has("s") || p.has("score"))) p.set("sort", "confidence");
  return { href: `/scanner?${p}`, parts };
}

/** Does this read like a question for Ask Viridia rather than a search? */
export const looksLikeQuestion = (q: string) =>
  /\?\s*$/.test(q) || /^(what|why|how|when|which|where|explain|compare|show|find|is|are|should|tell|summari[sz]e)\b/i.test(q.trim());
