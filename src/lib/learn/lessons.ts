/**
 * Learn: lessons built from worked examples, in two tracks. Elliott Wave lessons come from published
 * Elliott Wave analysis; market-context lessons cover the macro, credit, breadth and fundamental ideas
 * that frame a wave count.
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
  /** publication: a dated research issue; company: a company's own published material; history: well-documented market history. */
  kind: "publication" | "company" | "history";
  title: string;
  publisher: string;
  authors?: string;
  issue: string;
  /** Data the source covers through. */
  asOf?: string;
  url?: string;
  /** Where the source's own figures come from, when it cites someone else. */
  cites?: string;
}

export type Track = "Elliott Wave" | "Market context";

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
  track: Track;
  topic: "Patterns" | "Fibonacci" | "Degree and labels" | "Personality" | "Sentiment" | "Breadth" | "Credit" | "Rotation" | "Fundamentals";
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
    kind: "publication",
    title: "The Elliott Wave Financial Forecast",
    publisher: "Elliott Wave International",
    authors: "Steven Hochberg and Peter Kendall",
    issue: "November 2026",
    asOf: "2026-11-05",
    url: "https://www.elliottwave.com",
  },
  {
    id: "nexgen-uranium",
    kind: "company",
    title: "NexGen Energy investor presentation",
    publisher: "NexGen Energy",
    issue: "\u201cThe Market: Uranium\u2019s Moment\u201d",
    url: "https://www.nexgenenergy.ca",
    cites: "World Nuclear Association, The Nuclear Fuel Report (September 2025 edition), upper scenario",
  },
  {
    id: "history",
    kind: "history",
    title: "Market history",
    publisher: "Viridia",
    issue: "Well-documented episodes",
  },
];

export const LESSONS: Lesson[] = [
  {
    id: "zigzag-channel",
    title: "Zigzags: C equals A, at the channel line",
    topic: "Patterns",
    track: "Elliott Wave",
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
    track: "Elliott Wave",
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
    track: "Elliott Wave",
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
    track: "Elliott Wave",
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
    track: "Elliott Wave",
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
    track: "Elliott Wave",
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
    track: "Elliott Wave",
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
  {
    id: "supply-gap",
    title: "Reading a supply gap: scenario, scope and who is presenting",
    track: "Market context",
    topic: "Fundamentals",
    source: "nexgen-uranium",
    principle:
      "A supply-and-demand gap chart compares projected requirements with projected supply. Before accepting the conclusion, check three things: which scenario is shown (upper, reference or lower), what counts as supply (primary mine output alone, or secondary sources such as inventories, recycled material and enrichment underfeeding too), and who is presenting it. When new supply takes 15 to 20 years from discovery to production, it can't respond quickly, so prices have to rise and stay high long enough to fund new mines. That is the mechanism behind commodity bull markets, and also why they tend to overshoot.",
    example:
      "A NexGen Energy presentation, citing the World Nuclear Association's upper scenario, shows reactor requirements rising to about 530 million pounds of U\u2083O\u2088 a year by 2040 against roughly 200 million of expected primary supply. It sizes the gap at 42 million pounds (16.5%) in 2030, 109 million (28.7%) in 2035 and 335 million (63%) in 2040, and concludes that mine supply would need to more than triple and that prices must stay higher for longer. NexGen is a uranium developer that benefits from that conclusion, and the upper scenario is the most bullish of the WNA's cases.",
    recognize: [
      "The scenario named in the footnote: upper, reference or lower.",
      "Supply defined as primary production only, which makes the gap look larger.",
      "Long lead times that make supply slow to respond to price.",
      "A presenter with a stake in the conclusion.",
    ],
    inViridia:
      "Viridia has no commodity supply or demand data. Use the chart to see what the market is already pricing in uranium miners and physical-uranium vehicles, and the wave count to judge where that trend stands.",
    wrong:
      "Demand tracking the lower scenario, reactor delays, secondary supply filling more of the gap, or faster permitting would shrink the deficit. Prices falling while the story is unchanged would say the market had already priced it in.",
    tryIt: [
      { label: "Uranium miners (URNM)", href: "/terminal/URNM" },
      { label: "Cameco (CCJ)", href: "/terminal/CCJ" },
      { label: "NexGen (NXE)", href: "/terminal/NXE" },
    ],
    check: {
      q: "A company slide shows a supply gap using the upper demand scenario and primary supply only. What should you check first?",
      options: ["Whether the gap holds under the reference scenario with secondary supply included", "The company's share price", "Nothing; the source is cited"],
      answer: 0,
      why: "A cited source can still be its most favorable case. The reference scenario and the full supply picture tell you how much of the gap is assumption.",
    },
    diagram: {
      path: [[20, 96], [120, 62], [220, 24]],
      labels: [{ at: 0, text: "2030" }, { at: 1, text: "2035" }, { at: 2, text: "2040" }],
      lines: [{ from: [20, 106], to: [232, 112], tone: "neutral", dashed: true, label: "primary supply" }],
      caption: "Projected requirements (line) pull away from expected primary supply (dashed): the gap is the space between them, and it depends on the scenario chosen.",
    },
  },
  {
    id: "defensive-rotation",
    title: "Defensive rotation: when staples lead discretionary",
    track: "Market context",
    topic: "Rotation",
    source: "history",
    principle:
      "When investors turn cautious they move from economically sensitive groups toward defensive ones: consumer staples, health care, utilities. The ratio of consumer staples to consumer discretionary is a simple gauge. A sharp, sustained rise in staples' relative strength has tended to accompany or precede broad market declines; small wiggles in the ratio are noise. Treat it as a condition that raises the bar for bullish counts, not as a timing signal.",
    example:
      "Through 2007 and into 2008, consumer staples steadily outperformed consumer discretionary as housing and consumer credit weakened, and the ratio kept rising through the bear market. In 2000\u201302, defensive groups held up while the technology-led indexes fell.",
    recognize: [
      "Staples and health care making new highs while discretionary and technology lag.",
      "A steep, persistent rise in the staples-to-discretionary ratio, not a brief one.",
      "The same rotation showing up across several defensive groups at once.",
    ],
    inViridia:
      "Open the staples and discretionary ETFs side by side and compare their trends and counts. Viridia doesn't plot ratio charts yet. The Elliott Wave lesson on rolling peaks covers the same behavior from the wave side.",
    wrong:
      "Discretionary and technology regaining leadership while breadth widens would say the move into defensives was a pause, not a change of regime.",
    tryIt: [
      { label: "Consumer Staples (XLP)", href: "/terminal/XLP" },
      { label: "Consumer Discretionary (XLY)", href: "/terminal/XLY" },
      { label: "Lesson: rolling peaks", href: "/analysis/learn#rolling-peaks" },
    ],
    check: {
      q: "The staples-to-discretionary ratio rises steeply for several months. The best reading is:",
      options: ["A buy signal for discretionary", "A sign of growing caution that often accompanies market declines", "Proof a recession has started"],
      answer: 1,
      why: "It shows where money is hiding. It often accompanies weakness, but it neither times a top nor proves a recession.",
    },
  },
  {
    id: "credit-leads",
    title: "Credit often moves first",
    track: "Market context",
    topic: "Credit",
    source: "history",
    principle:
      "Bondholders get paid only if companies survive, so credit markets often register stress before stock markets. Watch high-yield spreads (the extra yield over Treasuries), the weakest tier (CCC) against stronger high yield (BB), and leveraged loans. When stocks fall but high-yield spreads fail to reach new wides, the selloff is less likely to be a credit event. When the weakest credits deteriorate while stocks sit near highs, risk is building beneath the surface.",
    example:
      "In 2007, high-yield spreads began widening in the summer as subprime losses spread, while the S&P 500 went on to make its final high in October before the 2007\u201309 bear market.",
    recognize: [
      "Spreads widening while equity indexes hold near highs.",
      "CCC credit weakening faster than BB credit.",
      "Equities falling without a matching widening in spreads, which argues for positioning, not credit stress.",
    ],
    inViridia:
      "Viridia doesn't track credit spreads. The Global Market Pulse shows high-yield credit through HYG, and comparing HYG with investment-grade (LQD) and Treasury ETFs gives a rough proxy for stress.",
    wrong:
      "Spreads tightening while stocks fall says the equity move isn't being driven by deteriorating credit.",
    tryIt: [
      { label: "High yield (HYG)", href: "/terminal/HYG" },
      { label: "Investment grade (LQD)", href: "/terminal/LQD" },
      { label: "Global market pulse", href: "/terminal" },
    ],
    check: {
      q: "Stocks drop sharply but high-yield spreads don't widen beyond their recent range. This suggests:",
      options: ["A credit crisis is underway", "The selloff is less likely to be a credit event", "Bonds are about to default"],
      answer: 1,
      why: "Credit not confirming the equity move points to positioning or sentiment rather than solvency stress.",
    },
  },
  {
    id: "breadth-highs-lows",
    title: "Breadth: new highs, new lows and the hidden average",
    track: "Market context",
    topic: "Breadth",
    source: "history",
    principle:
      "Cap-weighted indexes are dominated by their largest companies and can hide what most stocks are doing. Count new 52-week highs and lows, and compare the index with an equal-weighted or small-cap version. New lows expanding while the index holds up, or lower highs in the count of new highs during an advance, show participation narrowing.",
    example:
      "The NYSE advance-decline line peaked in April 1998 and fell for nearly two years while the large-cap indexes kept rising into early 2000.",
    recognize: [
      "The index near highs while new 52-week lows rise.",
      "Each push higher in the index accompanied by fewer new highs.",
      "Small caps or equal-weight indexes lagging the cap-weighted index.",
    ],
    inViridia:
      "Mission Control's regime card shows the share of Viridia's universe above its 50- and 200-day averages and advancers versus decliners at the last close. New-high and new-low counts aren't shown yet.",
    wrong:
      "New highs expanding, new lows shrinking and small caps keeping pace would say participation is broad.",
    tryIt: [
      { label: "Market regime and breadth", href: "/terminal" },
      { label: "Small caps (IWM)", href: "/terminal/IWM" },
      { label: "Nasdaq-100 (QQQ)", href: "/terminal/QQQ" },
    ],
    check: {
      q: "The S&P 500 sits near a high while new 52-week lows keep rising. This is:",
      options: ["Confirmation of the advance", "A breadth divergence", "A Fibonacci retracement"],
      answer: 1,
      why: "The average is being carried by fewer stocks while more of them break down.",
    },
  },
  {
    id: "selling-exhaustion",
    title: "Selling exhaustion: a bounce is not a bottom",
    track: "Market context",
    topic: "Sentiment",
    source: "history",
    principle:
      "A selloff often ends with a burst of forced selling, visible as several extremes at once: price several days outside its lower Bollinger band, RSI at a rare oversold reading, very heavy volume, put volume exceeding call volume. Such clusters usually mark exhaustion and produce a sharp rebound, often toward a widely watched average such as the 200-day. They don't by themselves end a bear market: the rebound can be a wave 2 or wave B rally inside a larger decline.",
    example:
      "On March 16, 2020 the VIX closed at a record 82.69 amid record trading volume; the S&P 500's low came a week later and a rapid rebound followed. By contrast, the forced selling of October 2008 produced a sharp rally, but the final low didn't come until March 2009.",
    recognize: [
      "Several oversold measures at extremes on the same days.",
      "Volume and option activity far above normal.",
      "A count that places the low at the end of a five-wave decline, which gives the low more weight than one in the middle of a third wave.",
    ],
    inViridia:
      "The levels rail shows RSI and MACD state and the latest divergence, and the chart shows volume. Viridia doesn't compute Bollinger bands or read options data. Use the count to decide whether an exhaustion low ends a pattern or only a wave within it.",
    wrong:
      "A rebound that fails quickly, followed by new lows on expanding downside momentum, says the selling wasn't exhausted.",
    tryIt: [
      { label: "S&P 500 (SPY)", href: "/terminal/SPY" },
      { label: "Lesson: five waves, then three", href: "/analysis/learn#five-down-three-up" },
    ],
    check: {
      q: "A stock shows record volume, a rare oversold RSI and several days below its lower Bollinger band. The most defensible expectation is:",
      options: ["A rebound, which may or may not be the final low", "The bear market is over", "Further immediate collapse is guaranteed"],
      answer: 0,
      why: "Exhaustion clusters usually produce rebounds; whether the low is final depends on the larger pattern.",
    },
    diagram: {
      path: [[14, 22], [60, 48], [80, 40], [130, 92], [146, 84], [168, 124], [196, 70], [214, 80], [230, 66]],
      labels: [{ at: 5, text: "exhaustion low", below: true }],
      lines: [{ from: [14, 60], to: [232, 60], tone: "fib", dashed: true, label: "200-day average" }],
      caption: "A steep decline ends in a cluster of extremes; the rebound often heads toward the 200-day average, which may or may not be the end of the decline.",
    },
  },
  {
    id: "ratio-charts",
    title: "Ratio charts: seeing a change in leadership",
    track: "Market context",
    topic: "Rotation",
    source: "history",
    principle:
      "A ratio chart divides one market by another and shows which is leading. Long ratio trends reveal changes of regime that single charts hide: energy against technology, gold miners against the Nasdaq-100, value against growth. Ratios can be wave-counted like prices, and a clear five-wave advance in a ratio says leadership has changed rather than paused.",
    example:
      "Energy's weight in the S&P 500 fell from about 16% in mid-2008 to under 3% in 2020 as technology led, then roughly doubled during 2021\u201322 as energy outperformed in the inflation shock.",
    recognize: [
      "A multi-year downtrend in a ratio that breaks and holds above its downtrend line.",
      "A ratio advance that subdivides into five waves.",
      "Leadership changing while the overall index goes sideways.",
    ],
    inViridia:
      "Viridia doesn't plot ratio charts yet. Open both sides and compare their trends and counts; a market in a five-wave advance against one in a correction is the single-chart version of the same reading.",
    wrong:
      "A ratio breakout that falls back inside its prior range says the old leader is still in charge.",
    tryIt: [
      { label: "Energy (XLE)", href: "/terminal/XLE" },
      { label: "Technology (XLK)", href: "/terminal/XLK" },
      { label: "Gold miners (GDX)", href: "/terminal/GDX" },
    ],
    check: {
      q: "A multi-year decline in the energy-to-technology ratio breaks out and advances in five waves. This suggests:",
      options: ["A change in leadership", "Both sectors are rising", "Technology is about to make a new high"],
      answer: 0,
      why: "A ratio measures relative performance; a motive advance in it says the numerator is taking over leadership.",
    },
  },
];

export const TRACKS: Track[] = ["Elliott Wave", "Market context"];
export const TOPICS = [...new Set(LESSONS.map((l) => l.topic))];
export const sourceOf = (id: string) => SOURCES.find((s) => s.id === id)!;
