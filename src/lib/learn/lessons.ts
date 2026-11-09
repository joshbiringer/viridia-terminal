/**
 * Learn: Elliott Wave lessons built from worked examples in published analysis.
 *
 * Each lesson states a principle in Viridia's own words, summarizes how a published source applied it
 * (credited, paraphrased, no charts or passages reproduced), says how to recognize it, how Viridia's
 * engine treats it, what would prove the reading wrong, and where to look in Viridia. Forecasts in the
 * examples belong to their authors as of the issue date; they are not Viridia signals.
 *
 * To add a new issue: add a LessonSource, then lessons whose `source` points at it.
 */

export interface LessonSource {
  id: string;
  title: string;
  publisher: string;
  authors: string;
  issue: string;
  /** Data the issue covers through. */
  asOf: string;
  url: string;
}

export interface Diagram {
  /** Polyline in a 240 × 140 box, y grows downward. */
  path: [number, number][];
  labels?: { at: number; text: string; below?: boolean }[];
  lines?: { from: [number, number]; to: [number, number]; tone?: "neutral" | "pos" | "neg" | "fib"; dashed?: boolean; label?: string }[];
  /** A horizontal band, e.g. the span of a previous fourth wave. */
  band?: { y1: number; y2: number; label: string };
  caption: string;
}

export interface Lesson {
  id: string;
  title: string;
  topic: "Patterns" | "Fibonacci" | "Degree and labels" | "Personality" | "Sentiment" | "Breadth";
  source: string;
  /** The principle, one paragraph, Viridia's words. */
  principle: string;
  /** How the source applied it, paraphrased and credited. */
  example: string;
  recognize: string[];
  /** How Viridia's engine treats it, and what it does not do. */
  inViridia: string;
  wrong: string;
  tryIt: { label: string; href: string }[];
  check: { q: string; options: string[]; answer: number; why: string };
  diagram?: Diagram;
}

export const SOURCES: LessonSource[] = [
  {
    id: "ewff-2026-11",
    title: "The Elliott Wave Financial Forecast",
    publisher: "Elliott Wave International",
    authors: "Steven Hochberg and Peter Kendall",
    issue: "November 2026",
    asOf: "2026-11-05",
    url: "https://www.elliottwave.com",
  },
];

export const LESSONS: Lesson[] = [
  {
    id: "zigzag-channel",
    title: "Zigzags: C equals A, at the channel line",
    topic: "Patterns",
    source: "ewff-2026-11",
    principle:
      "A zigzag is a sharp three-wave correction that subdivides 5-3-5. Wave C most often equals wave A in length. Drawing a line through the start of the zigzag and the end of wave B, then a parallel through the end of wave A, gives a channel whose upper edge often marks where C finishes. Because a zigzag moves against the larger trend, a decisive break of its lower channel line says the correction is over and the larger trend has resumed. Price often returns once to the underside of the broken line before moving away from it.",
    example:
      "EWI read the Philadelphia Semiconductor Index's rise from July 29 to October 6, 2026 as an upward zigzag inside the decline from its June 22 peak. Wave C matched wave A and the high came within ticks of the upper channel line. The index then fell about 17% in eight days, rallied for four days back to the underside of the broken channel (a final test the authors call a “kiss goodbye”) and turned lower again.",
    recognize: [
      "Three waves, with A and C each subdividing into five and B into three.",
      "C ends near equality with A, or at 1.618 times A when it extends.",
      "C reaches the upper channel line drawn from the 0–B line through A.",
      "A break of the lower line, then a weak rally back to it from below.",
    ],
    inViridia:
      "The rulebook eliminates any zigzag whose wave B retraces all of wave A. A wave C that fails to pass the end of A counts against the count as a guideline, since a truncated C is possible. C = A and C = 1.618 A are scored as Fibonacci evidence. Viridia draws the counts and Fibonacci targets on the chart; it does not yet draw the zigzag channel itself.",
    wrong:
      "A rally back inside the channel and above the end of C. That would mean the advance was not a finished correction; it could be the first wave of a new advance or part of a larger, more complex correction.",
    tryIt: [
      { label: "Semiconductor ETF (SMH)", href: "/terminal/SMH" },
      { label: "Zigzag rules", href: "/analysis/rulebook" },
      { label: "Scan for zigzags", href: "/scanner?pat=zigzag" },
    ],
    check: {
      q: "In a zigzag, which relationship between waves A and C is the most common?",
      options: ["C is 38.2% of A", "C equals A", "C is 2.618 times A"],
      answer: 1,
      why: "Equality is the most common relationship; 1.618 is the usual alternative when C extends.",
    },
    diagram: {
      path: [[14, 112], [62, 58], [92, 92], [150, 35], [172, 86], [190, 66], [224, 120]],
      labels: [{ at: 1, text: "A" }, { at: 2, text: "B", below: true }, { at: 3, text: "C" }, { at: 5, text: "kiss goodbye", below: true }],
      lines: [
        { from: [14, 112], to: [232, 55], tone: "neutral", label: "0\u2013B line" },
        { from: [30, 66], to: [232, 14], tone: "neutral", dashed: true, label: "parallel through A" },
      ],
      caption: "Upward zigzag: C equals A and ends at the upper channel line; price breaks the 0–B line, retests it from below, then falls away.",
    },
  },
  {
    id: "five-down-three-up",
    title: "The right look of a new trend: five waves, then three",
    topic: "Patterns",
    source: "ewff-2026-11",
    principle:
      "A trend change at a meaningful degree announces itself with a five-wave move in the new direction, followed by a three-wave move back. The five confirms the new trend; the three is wave 2, which is often deep and choppy and may be a double zigzag (w-x-y). Wave 2 can never move beyond the start of wave 1, so the top of the old trend becomes the level that would prove the count wrong.",
    example:
      "EWI counted the Dow Jones Industrial Average's fall from its August 5, 2026 peak as five subwaves completing wave 1 down, followed by a w-x-y rally for wave 2 that rose in a narrowing channel. On November 5 the Dow opened higher and filled the last open price gap left by wave 1, then turned lower with the rest of the market.",
    recognize: [
      "Five waves in the new direction, with wave 4 staying out of wave 1's territory and wave 3 usually the strongest.",
      "A correction that unfolds in three waves, often as two zigzags joined by an x wave.",
      "The correction retraces a large share of wave 1 but stays short of its start.",
      "Gaps left by wave 1 get filled during wave 2.",
    ],
    inViridia:
      "Wave 2 retracing beyond the start of wave 1 is a hard rule: any count that breaks it is eliminated. Double zigzags are recognized as combinations. The chart labels the preferred and alternate counts and shows the invalidation level in the levels rail.",
    wrong:
      "A move above the August 5 high. Wave 2 cannot exceed the start of wave 1, so the bear-market count would be invalid.",
    tryIt: [
      { label: "Dow ETF (DIA)", href: "/terminal/DIA" },
      { label: "Impulse rules", href: "/analysis/rulebook" },
    ],
    check: {
      q: "What level would invalidate a count of wave 1 down from the August 5 top, followed by wave 2 up?",
      options: ["The low of wave 1", "The 61.8% retracement of wave 1", "The August 5 high"],
      answer: 2,
      why: "Wave 2 never retraces more than 100% of wave 1. A deep retracement is normal; exceeding the start is not.",
    },
    diagram: {
      path: [[14, 20], [40, 52], [56, 40], [90, 96], [104, 84], [126, 116], [150, 86], [162, 98], [190, 60], [222, 112]],
      labels: [{ at: 0, text: "top" }, { at: 1, text: "i", below: true }, { at: 2, text: "ii" }, { at: 3, text: "iii", below: true }, { at: 4, text: "iv" }, { at: 5, text: "1", below: true }, { at: 6, text: "w" }, { at: 7, text: "x", below: true }, { at: 8, text: "2 (y)" }],
      lines: [{ from: [14, 20], to: [232, 20], tone: "neg", dashed: true, label: "invalidation" }],
      caption: "Five waves down make wave 1; a three-wave w-x-y rally makes wave 2 and must stay below the top.",
    },
  },
  {
    id: "previous-fourth-wave",
    title: "The previous fourth wave: where corrections tend to end",
    topic: "Fibonacci",
    source: "ewff-2026-11",
    principle:
      "Corrections, especially fourth waves, tend to end within the price span of the previous fourth wave of one lesser degree, most often near its end. When a five-wave sequence finishes, the move that follows typically retraces at least into that area, which gives a first target. Wave 2 and wave 4 also tend to alternate in form: if one is a sharp or simple correction, the other is usually sideways or complex.",
    example:
      "EWI counted five Intermediate waves down in the U.S. Treasury long bond from its March 2020 peak, ending at the October 7, 2026 low as Primary wave 1 or A. Wave (2) had been a flat and wave (4) a double three, an example of alternation. The authors' first target for the bond rally was the extreme of the prior wave (4), and they named the October low as the level that keeps that view intact.",
    recognize: [
      "A completed five-wave sequence with an identifiable fourth wave inside it.",
      "The correction that follows reaches back into the span of that fourth wave.",
      "Waves 2 and 4 look different: one simple, one complex or sideways.",
    ],
    inViridia:
      "Viridia scores alternation between waves 2 and 4 as a guideline: it adds or subtracts evidence when counts are ranked but never eliminates a count. The previous-fourth-wave tendency is not scored by the engine today; the Fibonacci confluence zones on the chart often overlap it, so compare the two by eye.",
    wrong:
      "A break below the October 7 low. EWI's stated alternate is that the low was only Minor wave 1 of wave (5), with a deeper decline still to come in Minor wave 3.",
    tryIt: [
      { label: "20+ year Treasury ETF (TLT)", href: "/terminal/TLT" },
      { label: "Fibonacci zones", href: "/analysis/fibonacci" },
    ],
    check: {
      q: "After a five-wave decline ends, where does the following rally usually reach at least?",
      options: ["The start of wave 1", "The span of the previous fourth wave", "The 23.6% retracement of wave 5"],
      answer: 1,
      why: "The previous fourth wave of one lesser degree is the usual first target for the countertrend move.",
    },
    diagram: {
      path: [[14, 16], [44, 52], [60, 38], [104, 94], [128, 64], [154, 82], [176, 74], [210, 124], [232, 78]],
      labels: [{ at: 1, text: "(1)", below: true }, { at: 2, text: "(2)" }, { at: 3, text: "(3)", below: true }, { at: 5, text: "(4)" }, { at: 7, text: "(5)", below: true }],
      band: { y1: 64, y2: 94, label: "previous fourth wave" },
      caption: "Five waves down; the rally that follows targets the span of wave (4).",
    },
  },
  {
    id: "degree",
    title: "Degree: one turn can end waves at several sizes",
    topic: "Degree and labels",
    source: "ewff-2026-11",
    principle:
      "Every wave belongs to a degree, and waves nest: each one subdivides into waves of the next lower degree. Labels show the degree: Grand Supercycle and Primary use circles, Supercycle and Intermediate parentheses, Cycle and Minor plain characters. A single turning point can end waves at several degrees at once, which is why one high can matter far more than its size on a daily chart suggests. A good count always names its degree and its next-best alternative.",
    example:
      "EWI's Dow wave-status table dated the start of four waves, from Grand Supercycle down to Primary, to the same day, August 5, 2026. It gave each a direction, a target and the next-best count.",
    recognize: [
      "Labels of different styles stacked at the same turning point.",
      "A count that states its degree and its alternate instead of a single forecast.",
      "Larger-degree turns produce larger and longer moves that follow.",
    ],
    inViridia:
      "Viridia works at primary, intermediate and minor degree and keeps the counts at each degree separate. The degree selector on a security page changes which counts, levels and targets are shown.",
    wrong:
      "Degree is a judgment, not a measurement. If the decline that follows a turn is too small or too brief for the degree assigned, the turn was lower degree than labelled.",
    tryIt: [{ label: "Dow ETF (DIA), switch degrees", href: "/terminal/DIA" }],
    check: {
      q: "What does it mean when one date is the start of waves at four different degrees?",
      options: ["The count is ambiguous", "The turn ended waves at several sizes at once", "Only the smallest degree is valid"],
      answer: 1,
      why: "Waves nest, so a single turn can complete waves of several degrees simultaneously.",
    },
  },
  {
    id: "rolling-peaks",
    title: "Rolling peaks: when leadership narrows",
    topic: "Breadth",
    source: "ewff-2026-11",
    principle:
      "Late in an advance, fewer stocks and sectors carry the averages. Indexes and sectors peak one after another instead of together, and defensive groups often make the last new highs as investors seek safety. In Elliott terms, fifth waves commonly show weaker breadth than third waves. Non-confirmation between related averages is a warning, not a timing signal.",
    example:
      "EWI listed the sequence: Dow Transports topped April 22, 2026, semiconductors June 22, the Dow Industrials August 5, small caps August 14, and the S&P 500 and NASDAQ October 6. Seven of eleven S&P sectors were not at new highs, and two of the four that were, Consumer Staples and Health Care, are defensive.",
    recognize: [
      "Major averages making highs on different dates.",
      "Fewer stocks above their 50- and 200-day averages while the index rises.",
      "Defensive sectors leading while cyclical and technology groups lag.",
    ],
    inViridia:
      "Mission Control's regime card shows the share of stocks above their 50- and 200-day averages and advancers versus decliners. Viridia does not yet compare sector peaks automatically.",
    wrong:
      "A broad advance in which lagging sectors and averages make new highs together would show participation widening, not narrowing.",
    tryIt: [
      { label: "Market breadth", href: "/terminal" },
      { label: "Technology (XLK)", href: "/terminal/XLK" },
      { label: "Consumer Staples (XLP)", href: "/terminal/XLP" },
    ],
    check: {
      q: "Defensive sectors making the last new highs while technology lags is most consistent with:",
      options: ["Broadening participation", "Narrowing leadership late in an advance", "A completed bear market"],
      answer: 1,
      why: "Late leadership by defensives is a sign of waning breadth, typical of a fifth wave.",
    },
  },
  {
    id: "wave-personality",
    title: "Wave personality: gaps, air pockets and falling on good news",
    topic: "Personality",
    source: "ewff-2026-11",
    principle:
      "Waves have characteristic behavior. Third waves are strong and broad and often show price gaps as the trend becomes obvious. An island reversal (a gap up, a period of trading, then a gap down below the first gap) marks a decisive turn. When prices fall on good news, the trend has changed: mood leads and fundamentals follow, so news gets interpreted through the new mood.",
    example:
      "EWI pointed to sudden gap-down declines (“air pockets”) in Alphabet, Fortinet, AMD and Intel in late October 2026. Intel's October 30 gap below a gap made six months earlier formed a bearish island reversal. Alphabet, Meta, Micron and Nvidia fell after strong results.",
    recognize: [
      "Downside gaps replacing the upside gaps of the advance.",
      "A cluster of trading isolated by a gap on each side.",
      "Declines on reports that beat expectations.",
    ],
    inViridia:
      "Viridia's engine counts waves from swing structure; it does not detect gaps or island reversals and it does not read news. Treat personality as context for the count you see on the chart.",
    wrong:
      "Prompt recovery through the gap that created an island, and resumed gains on good news, would argue the decline was a correction within the uptrend.",
    tryIt: [
      { label: "Intel (INTC)", href: "/terminal/INTC" },
      { label: "AMD", href: "/terminal/AMD" },
    ],
    check: {
      q: "A stock gaps down below a gap it made six months earlier. This forms:",
      options: ["A bearish island reversal", "A running flat", "A wave 4 triangle"],
      answer: 0,
      why: "An island reversal leaves a block of trading isolated by gaps on both sides.",
    },
  },
  {
    id: "sentiment-corroborates",
    title: "Sentiment corroborates the count",
    topic: "Sentiment",
    source: "ewff-2026-11",
    principle:
      "The wave count says where a pattern may be complete; sentiment says whether the crowd is positioned for a turn. Major lows come with widespread pessimism and major highs with widespread optimism. When the structure looks finished but positioning is not yet extreme, the correction may still have further to run. Magazine covers on a long trend are a classic sign of exhaustion.",
    example:
      "EWI judged gold's Intermediate wave (4) unfinished because large speculators and commercial hedgers in the futures market had moved toward, but not reached, the extremes seen at earlier lows; silver's Primary wave 4 got the same treatment. The bond low on October 7 came with a news magazine cover asking whether bonds would “blow up.” The dollar's January 2026 low came as investors fretted over “de-dollarization,” at the lower line of its channel and at the low of a 4.8-year cycle.",
    recognize: [
      "Futures positioning (Commitments of Traders) at multi-year extremes.",
      "A long trend featured on general-interest magazine covers.",
      "Pattern completion, a channel line and sentiment extreme arriving together.",
    ],
    inViridia:
      "Viridia does not ingest futures positioning or media sentiment. Its counts and confluence index are built from price, RSI and MACD only, so treat sentiment as a separate check you make yourself.",
    wrong:
      "Sentiment is a condition, not a trigger. Extremes can persist, and a pattern that keeps extending after sentiment looks extreme means the count, not the crowd, was wrong.",
    tryIt: [
      { label: "Gold (GLD)", href: "/terminal/GLD" },
      { label: "Silver (SLV)", href: "/terminal/SLV" },
      { label: "Dollar (UUP)", href: "/terminal/UUP" },
    ],
    check: {
      q: "A correction looks complete on the chart but positioning is far from its usual extreme. The cautious reading is:",
      options: ["The correction may not be finished", "Buy immediately", "The count is invalid"],
      answer: 0,
      why: "Sentiment that hasn't reached an extreme is a reason to wait for more evidence, not proof the count is wrong.",
    },
  },
];

export const TOPICS = [...new Set(LESSONS.map((l) => l.topic))];
export const sourceOf = (id: string) => SOURCES.find((s) => s.id === id)!;
