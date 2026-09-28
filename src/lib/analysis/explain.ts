/**
 * Ask Viridia: plain-language answers built only from what the engine calculated for this security
 * (the ranked counts, their evidence, levels, Fibonacci targets, zones and setups) plus the wave
 * descriptions in the source material. Nothing is generated beyond that: when the engine has no
 * answer, the answer says so.
 */
import { fmtPrice } from "@/lib/market-data/bars";
import { fmtDate } from "@/lib/format";
import { pct } from "@/lib/market-data/snapshot";
import { DEGREE_LABEL, type Degree } from "./pivots";
import {
  PATTERN_LABEL, SETUP_LABEL,
  type ClientCandidate, type ClientCandidates, type ConfluenceZone, type Glance, type Glances, type Setups,
} from "./candidates";
import { SETUP_STORY, entryText } from "./setups";

export type Block =
  | { kind: "p"; text: string }
  | { kind: "list"; items: { text: string; tone?: "pos" | "neg" }[] }
  | { kind: "levels"; rows: { name: string; value: string; note: string; tone?: "pos" | "neg" | "fib" }[] };

export interface Answer { title: string; blocks: Block[]; sources: string[] }

/** Timeframe-level context: the page's daily analysis, and optionally the weekly one and yesterday's summary. */
export interface ExplainContext {
  symbol: string;
  degree: Degree;
  close: number | null;
  glances: Glances | null;
  candidates: ClientCandidates | null;
  zones: ConfluenceZone[];
  setups: Setups | null;
  /** Why there is no setup at a degree. */
  setupReasons?: Record<string, string | null> | null;
  weekly?: Glance | null;
  history?: HistoryPoint[] | null;
}

/** One stored day of the preferred daily count (Phase 4 history). */
export interface HistoryPoint {
  day: string; degree: string | null; pattern: string | null; complete: boolean | null; wave: string | null;
  wave_dir: string | null; score: number | null; hold: number | null; setup_side: string | null; setup_kind: string | null;
}

export const QUESTIONS = [
  { id: "why", q: "Why is this the preferred count?", keys: ["why", "preferred", "reason", "evidence", "confidence"] },
  { id: "invalidate", q: "What invalidates this count?", keys: ["invalid", "stop", "break", "wrong", "risk", "level"] },
  { id: "targets", q: "Explain the Fibonacci targets.", keys: ["target", "fib", "zone", "confluence", "where"] },
  { id: "alternate", q: "Show the alternate count.", keys: ["alternate", "other", "else", "second"] },
  { id: "setup", q: "Is there a buy or sell setup?", keys: ["setup", "buy", "sell", "signal", "trade", "entry"] },
  { id: "wave", q: "What is the wave in progress usually like?", keys: ["like", "personality", "wave 1", "wave 2", "wave 3", "wave 4", "wave 5", "wave a", "wave b", "wave c", "learn", "teach", "explain wave"] },
  { id: "weekly", q: "Compare the weekly and daily structures.", keys: ["weekly", "week", "daily", "timeframe", "compare", "align"] },
  { id: "changed", q: "What changed since yesterday?", keys: ["change", "yesterday", "new", "different", "since"] },
] as const;
export type QuestionId = (typeof QUESTIONS)[number]["id"];

/** Route a typed question to the closest built-in one, or null when nothing matches. */
export function route(text: string): QuestionId | null {
  const t = ` ${text.toLowerCase()} `;
  let best: { id: QuestionId; n: number } | null = null;
  for (const q of QUESTIONS) {
    const n = q.keys.filter((k) => t.includes(k)).length;
    if (n && (!best || n > best.n)) best = { id: q.id, n };
  }
  return best?.id ?? null;
}

// ------------------------------------------------------------------------------------------ helpers

const p = (text: string): Block => ({ kind: "p", text });
const dist = (price: number | null, close: number | null) => (price != null && close ? ` (${pct(price / close - 1, 1)} from the close)` : "");

function countName(c: { pattern: ClientCandidate["pattern"]; direction: "up" | "down"; complete: boolean; next: { label: string; direction: "up" | "down" } } ): string {
  const name = `${PATTERN_LABEL[c.pattern].toLowerCase()} ${c.direction}`;
  return c.complete ? `a complete ${name}, next move ${c.next.direction}` : `${/^[aeiou]/.test(name) ? "an" : "a"} ${name} with wave ${c.next.label} in progress (${c.next.direction})`;
}

function pointsList(c: ClientCandidate): Block {
  return {
    kind: "list",
    items: c.points.map((x, i) => ({
      text: i === 0 ? `Start: ${fmtPrice(x.price)} on ${fmtDate(x.ts)}` : `Wave ${x.label} ended at ${fmtPrice(x.price)} on ${fmtDate(x.ts)}`,
    })),
  };
}

function pick(ctx: ExplainContext): { g: Glance | null; pref: ClientCandidate | null; alt: ClientCandidate | null; set: ClientCandidates[Degree] | null } {
  const g = ctx.glances?.[ctx.degree] ?? null;
  const set = ctx.candidates?.[ctx.degree] ?? null;
  const pref = g && set ? set.candidates.find((c) => c.id === g.preferred.id) ?? null : null;
  const alt = g?.alternate && set ? set.candidates.find((c) => c.id === g.alternate!.id) ?? null : null;
  return { g, pref, alt, set };
}

const noCount = (ctx: ExplainContext, title: string): Answer => ({
  title,
  blocks: [p(`There is no rule-valid wave count for ${ctx.symbol} at ${DEGREE_LABEL[ctx.degree].toLowerCase()} degree, so there is nothing to explain here. Try another degree on the page; Viridia shows no label rather than a guess.`)],
  sources: ["Viridia rulebook"],
});

// ------------------------------------------------------------------------------------------ answers

export function answer(id: QuestionId, ctx: ExplainContext): Answer {
  switch (id) {
    case "why": return why(ctx);
    case "invalidate": return invalidate(ctx);
    case "targets": return targets(ctx);
    case "alternate": return alternate(ctx);
    case "setup": return setup(ctx);
    case "wave": return wave(ctx);
    case "weekly": return weekly(ctx);
    case "changed": return changed(ctx);
  }
}

function why(ctx: ExplainContext): Answer {
  const title = "Why this is the preferred count";
  const { g, pref, alt, set } = pick(ctx);
  if (!g || !pref || !set) return noCount(ctx, title);
  const blocks: Block[] = [
    p(`At ${DEGREE_LABEL[ctx.degree].toLowerCase()} degree the engine reads ${ctx.symbol} as ${countName(pref)}. The labeled points:`),
    pointsList(pref),
    p(`Every count shown passes every hard rule. At this degree ${set.examined.toLocaleString("en-US")} labelings of the recent swings were tested and ${set.eliminated.toLocaleString("en-US")} broke a rule. Of the ${g.valid}${set.truncated ? "+" : ""} that remain, this one satisfies the largest share of guidelines, which is how the sources say to choose the preferred interpretation.`),
  ];
  const f = pref.confidence?.factors;
  if (f?.length) {
    blocks.push(p(`Pattern Confidence ${g.preferred.score}: ${pref.confidence!.passed} of ${pref.confidence!.evaluated} guideline checks met.`));
    blocks.push({ kind: "list", items: [...f.filter((x) => x.pass), ...f.filter((x) => !x.pass)].map((x) => ({ text: `${x.pass ? "Met" : "Not met"}: ${x.text}`, tone: x.pass ? "pos" : "neg" })) });
  }
  if (g.alternate) {
    blocks.push(p(g.closeCall
      ? `It is a close call: the alternate, ${alt ? countName(alt) : "a different reading"}, scores ${g.alternate.score}. Treat the structure as unresolved until price rules one out.`
      : `The best competing reading, ${alt ? countName(alt) : "the alternate"}, scores ${g.alternate.score}.`));
  } else if (g.valid > 1) {
    blocks.push(p(`All ${g.valid} remaining counts tell the same story from different starting points, so there is no competing reading at this degree yet.`));
  }
  blocks.push(p("Pattern Confidence ranks counts against each other. It is not a probability that price will do anything."));
  return { title, blocks, sources: ["Viridia rulebook", "Prechter, Essentials (choosing the preferred count)"] };
}

function invalidate(ctx: ExplainContext): Answer {
  const title = "What invalidates the preferred count";
  const { g, pref, alt } = pick(ctx);
  if (!g || !pref) return noCount(ctx, title);
  const blocks: Block[] = [];
  const pg = g.preferred;
  if (pg.hold != null) {
    blocks.push({ kind: "levels", rows: [{
      name: "Invalidation", value: fmtPrice(pg.hold), tone: "neg",
      note: `Price ${pg.holdSide} this level${dist(pg.hold, ctx.close)} breaks the count${pref.next.holdReason ? `: ${pref.next.holdReason}` : ""}.`,
    }] });
    blocks.push(p("This is a hard rule from the rulebook, not a judgment call. Rules are what always hold in a valid count, which is why the sources treat these levels as objective risk points."));
  } else if (pg.reassess != null) {
    blocks.push(p(`The count is a finished pattern, and the rules set no invalidation level for a finished pattern. The level to watch is where it ended:`));
    blocks.push({ kind: "levels", rows: [{
      name: "Reassess", value: fmtPrice(pg.reassess), tone: "neg",
      note: `A move ${pg.reassessSide} it${dist(pg.reassess, ctx.close)} means the last wave is still extending, so the pattern isn't complete after all.`,
    }] });
  } else {
    blocks.push(p("The rules set no level for the count in this state. It stays valid until its next wave completes and can be checked."));
  }
  if (pref.invalidation != null && pref.invalidation !== pg.hold) {
    blocks.push(p(`Further out, ${fmtPrice(pref.invalidation)}${dist(pref.invalidation, ctx.close)} is the nearest level at which any rule for this labeling fails.`));
  }
  if (g.alternate && alt) blocks.push(p(`If the preferred count fails, the alternate (${countName(alt)}) would lead.`));
  return { title, blocks, sources: ["Viridia rulebook", "EWI, Basics (rule levels as risk points)"] };
}

function targets(ctx: ExplainContext): Answer {
  const title = "The Fibonacci targets";
  const { g, pref } = pick(ctx);
  if (!g || !pref) return noCount(ctx, title);
  const blocks: Block[] = [];
  const what = pref.complete ? "the move after the finished pattern" : `wave ${pref.next.label}`;
  if (pref.targets.length) {
    blocks.push(p(`Targets for ${what}, from the relationships the sources describe for that wave. Only levels price hasn't reached yet are listed:`));
    blocks.push({ kind: "levels", rows: pref.targets.map((t) => ({
      name: t.primary ? "Primary relationship" : "Secondary", value: fmtPrice(t.price), note: `${t.label}${dist(t.price, ctx.close)}`, tone: "fib",
    })) });
  } else {
    blocks.push(p(`The preferred count has no unreached Fibonacci target for ${what}.`));
  }
  const near = [...ctx.zones].sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct)).slice(0, 3);
  if (near.length) {
    blocks.push(p("Where relationships from different counts and degrees cluster (confluence zones), nearest first:"));
    blocks.push({ kind: "levels", rows: near.map((z) => ({
      name: `${z.count} relationships`, value: `${fmtPrice(z.low)}–${fmtPrice(z.high)}`, tone: "fib",
      note: `${pct(z.distancePct, 1)} from the close. ${z.levels.slice(0, 3).map((l) => l.label).join("; ")}${z.levels.length > 3 ? "; …" : ""}`,
    })) });
  }
  blocks.push(p("Viridia measures Fibonacci levels only from rule-valid counts. The sources warn that ratios between unrelated moves mean nothing, and a zone's strength is a weighted count of relationships, not a probability."));
  return { title, blocks, sources: ["EWI, Basics (Fibonacci needs a valid count)", "Prechter, Essentials (ratio analysis)", "EWF"] };
}

function alternate(ctx: ExplainContext): Answer {
  const title = "The alternate count";
  const { g, pref, alt } = pick(ctx);
  if (!g || !pref) return noCount(ctx, title);
  if (!g.alternate || !alt) {
    return { title, blocks: [p(g.valid > 1
      ? `All ${g.valid} rule-valid counts at this degree tell the same story as the preferred count (${countName(pref)}), from different starting points. There is no competing reading yet.`
      : "Only one labeling passes the rules at this degree, so there is no alternate.")], sources: ["Viridia rulebook"] };
  }
  const blocks: Block[] = [
    p(`The alternate reads ${ctx.symbol} as ${countName(alt)}, scoring ${g.alternate.score} against the preferred count's ${g.preferred.score}.`),
    pointsList(alt),
    p(`It tells a different story from the preferred count (${countName(pref)}): ${alt.next.direction === pref.next.direction
      ? `both expect the current move to be ${alt.next.direction}, but they disagree about where it sits in the pattern, which changes what follows.`
      : `it expects the current move to be ${alt.next.direction}, the preferred count ${pref.next.direction}.`}`),
  ];
  const lvl = g.preferred.hold ?? g.preferred.reassess;
  if (lvl != null) blocks.push(p(`What would promote it: price crossing the preferred count's level at ${fmtPrice(lvl)}${dist(lvl, ctx.close)}.`));
  blocks.push(p("The sources say two or more valid interpretations are usually acceptable, so the alternate is the backup plan, not a discarded idea."));
  return { title, blocks, sources: ["Prechter, Essentials (alternate counts)"] };
}

function setup(ctx: ExplainContext): Answer {
  const title = "The setup";
  const s = ctx.setups?.[ctx.degree] ?? null;
  if (!s) {
    const why = ctx.setupReasons?.[ctx.degree] ?? "A setup needs a stop and a target on the right sides of the entry, with at least as much reward as risk.";
    return { title, blocks: [p(`The preferred ${DEGREE_LABEL[ctx.degree].toLowerCase()} count doesn't define a setup right now. ${why} Viridia shows nothing rather than a guess.`)], sources: ["Viridia setup method"] };
  }
  return {
    title: `${s.side === "buy" ? "Buy" : "Sell"} setup: ${SETUP_LABEL[s.kind]}`,
    blocks: [
      p(SETUP_STORY[s.kind]),
      { kind: "levels", rows: [
        { name: s.status === "active" ? "Entry (now)" : "Entry (waiting)", value: entryText(s), note: s.entry.basis },
        { name: "Stop", value: fmtPrice(s.stop.price), note: `${s.stop.basis}${dist(s.stop.price, ctx.close)}`, tone: "neg" },
        { name: "Target", value: fmtPrice(s.target.price), note: `${s.target.basis}${dist(s.target.price, ctx.close)}`, tone: "pos" },
        { name: "Reward : risk", value: `${s.rr.toFixed(1)} : 1`, note: `Risk to the stop is ${pct(s.riskPct, 1).replace("+", "")} of the entry price.` },
      ] },
      ...(s.cautions.length ? [{ kind: "list", items: s.cautions.map((c) => ({ text: c })) } as Block] : []),
      p("This restates the wave count as a trade. It is research output, not a recommendation; position size and whether to act are yours."),
    ],
    sources: ["Viridia setup method", "EWI, Basics", "Prechter, Essentials"],
  };
}

/** Wave personality, from the sources (see viridia-wave-knowledge.md, section 3). */
const PERSONALITY: Record<string, { text: string; source: string }> = {
  "1": { text: "Wave 1 usually starts while the news for that degree is at its worst. Most people don't believe the move and treat it as a rally to sell into.", source: "Article, citing Elliott Wave Principle" },
  "2": { text: "Wave 2 often retraces deeply, because the crowd expects the old trend to resume. It unfolds in a corrective three-wave shape, and it can never go past the start of wave 1.", source: "Article; Essentials (rule)" },
  "3": { text: "Wave 3 is usually the strongest and broadest wave: the trend becomes unmistakable and fundamentals improve. It gives the most valuable clues to the count, and it can never be the shortest of waves 1, 3 and 5.", source: "Article; Essentials (rule)" },
  "4": { text: "Wave 4 often moves more sideways than against the trend, and it alternates with wave 2: if one was sharp, the other tends to be sideways. In an impulse it can't enter wave 1's price territory.", source: "Article; Essentials" },
  "5": { text: "Wave 5 is almost never as dynamic as wave 3. It tends to come on lighter volume and narrower breadth, while optimism looks best, which is why the sources advise reducing risk late in a fifth wave rather than chasing it.", source: "Article, citing Elliott Wave Principle" },
  A: { text: "Wave A is the first leg against the trend. In a zigzag it unfolds in five waves; in a flat, in three, which is why a flat's B wave recovers most or all of it.", source: "Essentials; EWI, Elliott Wave Theory" },
  B: { text: "Wave B retraces wave A. In a zigzag it stays well short of A's start; in a flat it returns to about A's start or beyond it.", source: "Essentials" },
  C: { text: "Wave C is the final leg of the correction and unfolds in five waves. In a zigzag it often equals wave A; in a regular flat it ends slightly beyond A's end, in an expanded flat substantially beyond.", source: "Essentials" },
  D: { text: "Wave D is the fourth leg of a triangle. In a contracting triangle it stays short of the end of wave B.", source: "Essentials" },
  E: { text: "Wave E is the last leg of a triangle, after which a thrust in the direction of the larger trend normally follows.", source: "Essentials" },
};

function wave(ctx: ExplainContext): Answer {
  const { g, pref } = pick(ctx);
  if (!g || !pref) return noCount(ctx, "The wave in progress");
  if (pref.complete) {
    const motive = pref.pattern === "impulse" || pref.pattern.endsWith("diagonal");
    return {
      title: "After a finished pattern",
      blocks: [p(motive
        ? "The preferred count is a finished five-wave move. What follows is a correction of it in three waves (or a combination), which the sources say tends to end near the previous fourth wave of lesser degree."
        : "The preferred count is a finished correction, so the larger trend would normally resume with a new motive wave, starting with the wave 1 behaviour below."),
        ...(motive ? [] : [p(PERSONALITY["1"].text)])],
      sources: ["Prechter, Essentials", "Article"],
    };
  }
  const k = pref.next.label.toUpperCase();
  const w = PERSONALITY[k];
  if (!w) return { title: `Wave ${pref.next.label}`, blocks: [p("The sources don't describe this wave's personality separately.")], sources: [] };
  return { title: `What wave ${pref.next.label} is usually like`, blocks: [p(w.text), p(`Here, the preferred count has wave ${pref.next.label} moving ${pref.next.direction} from ${fmtPrice(pref.points.at(-1)!.price)} (${fmtDate(pref.points.at(-1)!.ts)}).`)], sources: [w.source] };
}

function weekly(ctx: ExplainContext): Answer {
  const title = "Weekly versus daily";
  const d = ctx.glances?.auto ?? null;
  const w = ctx.weekly ?? null;
  if (!d || !w) {
    return { title, blocks: [p(!w
      ? `There is no rule-valid weekly count for ${ctx.symbol} yet, so the timeframes can't be compared. Weekly counts need more history than daily ones.`
      : `There is no rule-valid daily count for ${ctx.symbol} yet.`)], sources: ["Viridia rulebook"] };
  }
  const say = (x: Glance) => `${PATTERN_LABEL[x.preferred.pattern].toLowerCase()} ${x.preferred.direction}, ${x.preferred.complete ? `complete, next move ${x.preferred.waveDirection}` : `wave ${x.preferred.wave} ${x.preferred.waveDirection}`} (Pattern Confidence ${x.preferred.score}, ${DEGREE_LABEL[x.degree].toLowerCase()} degree)`;
  const agree = d.preferred.waveDirection === w.preferred.waveDirection;
  return {
    title,
    blocks: [
      { kind: "levels", rows: [
        { name: "Weekly", value: w.preferred.waveDirection === "up" ? "Up ↑" : "Down ↓", note: say(w) },
        { name: "Daily", value: d.preferred.waveDirection === "up" ? "Up ↑" : "Down ↓", note: say(d) },
      ] },
      p(agree
        ? `Both timeframes expect the current move to be ${d.preferred.waveDirection}: the daily structure is moving with the larger one.`
        : `They disagree: the weekly count expects ${w.preferred.waveDirection}, the daily ${d.preferred.waveDirection}. That usually means the daily move is a correction inside the larger weekly trend, so daily setups against the weekly direction carry more risk.`),
      p("Each timeframe is counted separately from its own bars. Reconciling the two into one multi-degree count is a later engine phase."),
    ],
    sources: ["Viridia engine (daily and weekly analyses)"],
  };
}

function changed(ctx: ExplainContext): Answer {
  const title = "What changed since the last session";
  const h = ctx.history ?? [];
  if (h.length < 2) {
    return { title, blocks: [p("Viridia started keeping a daily record of each preferred count on September 28, 2026. There isn't a previous day to compare with yet for this security; check back after the next session.")], sources: ["Viridia analysis history"] };
  }
  const [now, prev] = h;
  const label = (x: HistoryPoint) => x.pattern ? `${PATTERN_LABEL[x.pattern as ClientCandidate["pattern"]] ?? x.pattern} ${x.complete ? "complete" : `wave ${x.wave}`} ${x.wave_dir === "up" ? "↑" : "↓"}` : "no count";
  const items: { text: string; tone?: "pos" | "neg" }[] = [];
  if (label(now) !== label(prev)) items.push({ text: `Preferred count: ${label(prev)} → ${label(now)}` });
  if (now.degree !== prev.degree) items.push({ text: `Degree summarized: ${prev.degree ?? "none"} → ${now.degree ?? "none"}` });
  if (now.score !== prev.score && now.score != null && prev.score != null) items.push({ text: `Pattern Confidence: ${prev.score} → ${now.score}`, tone: now.score > prev.score ? "pos" : "neg" });
  if (now.hold !== prev.hold) items.push({ text: `Invalidation level: ${prev.hold != null ? fmtPrice(prev.hold) : "none"} → ${now.hold != null ? fmtPrice(now.hold) : "none"}` });
  if (now.setup_side !== prev.setup_side || now.setup_kind !== prev.setup_kind) {
    const s = (x: HistoryPoint) => x.setup_side ? `${x.setup_side} (${SETUP_LABEL[x.setup_kind as keyof typeof SETUP_LABEL] ?? x.setup_kind})` : "none";
    items.push({ text: `Setup: ${s(prev)} → ${s(now)}` });
  }
  return {
    title,
    blocks: [
      p(`Comparing the analysis of ${fmtDate(now.day)} with ${fmtDate(prev.day)}:`),
      items.length ? { kind: "list", items } : p("Nothing material changed: same preferred count, confidence, invalidation level and setup."),
    ],
    sources: ["Viridia analysis history"],
  };
}
