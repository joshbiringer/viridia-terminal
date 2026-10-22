# Viridia Wave Knowledge Base

This file records the Elliott Wave material Josh has provided and how each idea turns into engine behavior. Add new material here as it arrives. Every item is tagged with its source and with the phase that uses it.

**Sources**
- **EWP:** Frost & Prechter, *Elliott Wave Principle: Key to Market Behavior*, EWI 34-lesson course edition (project upload, 2026-10-22). This is the primary text. Lesson numbers are cited as "EWP L#".
- **Essentials:** Prechter, *Learn the Essentials of the Elliott Wave Principle* (project file)
- **Basics:** EWI, *Basics of the Elliott Wave Principle* (project file)
- **EWT doc:** EWI, *Elliott Wave Theory* (project doc)
- **Article:** "Buying High; Selling Low: No No No!!" (Feb 13, 2012), provided 2026-09-25

---

## 1. What the engine must never do

- **Use a Fibonacci level without a valid wave count behind it.** Basics warns that Fibonacci ratios "require a valid Elliott wave interpretation as a starting point." EWP L22 goes further: "wave form analysis must take precedence over the implications of the proportionate relationships of waves," and form comes first, "with ratio analysis as backup" (L23). So Viridia measures count targets only from rule-valid counts. Plain swing retracements get half weight and are labeled "Swing".
- **Measure from non-orthodox extremes.** EWP L22: "Ratios between lengths based on orthodox pattern termination levels are reliable; those based on nonorthodox price extremes generally are not." The *orthodox* end of a pattern can differ from its price extreme (EWP L9). Examples: the end of a truncated wave 5 is the orthodox top even though wave 3 was higher; the start of an expanded flat's wave A is the orthodox top even though wave B went higher. Viridia measures only between labeled pattern endpoints, never from the raw high or low of a range.
- **Treat a count as certain.** EWP L15: "certainty about the order of probabilities is [not] the same as certainty about one specific outcome." So Viridia always shows the alternates, and a zone's strength is a weighted count, never a probability.
- **Call a correction finished on a five.** EWP L6: "corrections are never fives… an initial five-wave movement against the larger trend is never the end of a correction, only part of it." *(New: see section 7.)*
- **Force a five into a three.** EWP L13 ("The Right Look"): any five can be forced into three by calling waves 1–3 "A," but "it is incorrect to do so." A long wave 3 with wave 4 ending well above the top of wave 1 must be counted as a five.

## 2. Fibonacci relationships (fib-1.0.1, live; EWP additions marked ▲)

### Retracements (EWP L20)

| Wave | Relationship | Source |
|---|---|---|
| Sharp corrections (wave 2, B of a zigzag, X of a multiple zigzag) | Most often 61.8% or 50% of the prior wave | EWP L20; Basics |
| Sideways corrections, especially wave 4 | Most often 38.2% of the prior impulse wave | EWP L20 |
| Wave 4 | Retraces 23.6–50% of wave 3. Tends to end within the prior fourth wave of one lesser degree, most commonly near its end. | EWF; EWP L11 |

EWP L20 adds a caution: retracements "are merely tendencies, yet that is where most analysts place an inordinate focus because measuring retracements is easy. Far more precise and reliable… are relationships between alternate waves."

### Motive wave multiples (EWP L12, L21)

| Relationship | Detail | Source |
|---|---|---|
| Wave 3 | 161.8% of wave 1 or more | EWF |
| Equality | The two non-extended waves tend toward equality **in time and magnitude**, especially when wave 3 extends. If not equal, 0.618 is next most likely. | EWP L12 |
| ▲ All three motive waves | Related by 1.0, 1.618 or 2.618 (inverses 0.618, 0.382) | EWP L21 |
| Wave 5 vs waves 1–3 | 0.382 or 0.618 × (0→3) when wave 5 is **not** extended; 1.618 × (0→3) when it is | EWP L21; Essentials |
| ▲ Wave 1 extended | Wave 2 divides the whole impulse into the Golden Section | EWP L21 |
| ▲ Wave 4 as Golden Section divider | Unless wave 1 extends, some point within wave 4 divides the impulse so that the remaining portion is **0.382 of the total** (wave 5 not extended) or **0.618** (wave 5 extended). The dividing point can be wave 4's start, end or extreme, so this gives 2–3 clustered wave-5 targets. | EWP L21, L29 |
| ▲ Wave 4 vs wave 2 | Wave 4 often spans a gross or net range equal to, or Fibonacci-related to, wave 2 | EWP L21 |
| ▲ Scale | Above Intermediate degree, state relationships in **percentage** terms (semilog). At small degrees, points and percentages agree. | EWP L12, L21 |

### Corrective wave multiples (EWP L21)

| Pattern | Relationship | Source |
|---|---|---|
| Zigzag | C = A usually; 1.618 × A or 0.618 × A "not uncommonly" | EWP L21 |
| ▲ Double zigzag | The second zigzag relates to the first the same way (equality, 1.618, 0.618) | EWP L21 |
| ▲ Regular flat | A ≈ B ≈ C | EWP L21 |
| Expanded flat | C is often 1.618 × A. ▲ Or C ends beyond A's end by 0.618 × A. ▲ Rarely C = 2.618 × A. ▲ B is sometimes 1.236 or 1.382 × A. | EWP L21 |
| Contracting triangle | At least two alternate legs relate by 0.618 (e = 0.618c, c = 0.618a, or d = 0.618b). Rarely, adjacent legs do. | EWP L21 |
| ▲ Expanding triangle | Alternate legs relate by 1.618 | EWP L21 |
| ▲ Double/triple threes | The net travel of one simple pattern equals another, or relates by 0.618 (especially if one is a triangle) | EWP L21 |
| ▲ Triangle thrust | Wave 5 after a fourth-wave triangle travels about the width of the triangle's widest part. If it goes clearly past that, expect a protracted fifth. | EWP L8; L24 example |
| After a correction | Corrections, especially fourth waves, tend to end within the span of the previous fourth wave of lesser degree | EWP L11 |

Essentials and EWP L20 agree: relationships between alternate waves are "far more reliable" than retracements. **rank-1.1.0** adds this as its own check: "fib.alternate_ratio" requires 5:1, C:A or triangle legs to be within 5% of a Fibonacci ratio.

### ▲ Confluence (EWP L23)

"All degrees of trend are always operating on the market at the same time… future levels that create several Fibonacci relationships have a greater likelihood of marking a turn than a level that creates only one." EWP's example: a 0.618 retracement of Primary [1], a 1.618 × (a) target for Intermediate (c) and a 1.0 × wave 1 target for Minor wave 5 all landing on one price. This is the basis for Viridia's weighted zone counts. Zones should be built across degrees, not just within one count.

EWP L23 also says targets test the count. If price reverses at a computed level and the count is acceptable, "a doubly significant point has been reached." If the market gaps through a level, expect the next one. If targets are missed or exceeded "by a significant margin," reconsider the preferred count.

### ▲ Fibonacci time (EWP L25)

"There is no sure way of using the time factor by itself in forecasting." Fibonacci time spans (in bars, days, months, years) "serve to indicate possible times for a turn, especially if they coincide with price targets and wave counts." Bolton warns that time permutations "tend to become infinite." Rhea's bull/bear ratio gives a corrective duration of about 0.618 × the advance. **Engine use:** time is supporting evidence only, never a standalone signal.

## 3. Wave personality (live in rank-1.0.0 and 1.1.0, and in Ask Viridia's "What is the wave in progress like?")

EWP L14: personality "can help determine one's present location in the progression of waves, when for other reasons the count is unclear." It is the tie-breaker between valid counts. Described for a bull market; reverse for bear markets.

| Wave | Personality | Source |
|---|---|---|
| 1 | About half of first waves are part of the basing process and are heavily corrected by wave 2. They show a subtle rise in volume and breadth, with plenty of short selling ("one more rally to sell"). The other half rise from large bases, downside failures or extreme compression; those are dynamic and only moderately retraced. Worst news for the degree hits at the start. | EWP L14; Article |
| 2 | Often retraces so much that most of wave 1's gain is erased. Fear: investors are "convinced that the bear market is back to stay." Often makes downside non-confirmations; low volume and volatility signal that selling is drying up. Corrective look (three waves, not five). | EWP L14; Article |
| 3 | "Wonders to behold": strong, broad and unmistakable, with the greatest volume and price movement. Usually the extended wave. The **third of a third** is the most volatile point, with breakouts, continuation gaps, volume expansion and exceptional breadth. Along with B waves, gives "the most valuable clues to the wave count." | EWP L14 |
| 4 | Predictable in depth (prior fourth of lesser degree) and form (alternation with wave 2). More often sideways, building a base for wave 5. Lagging stocks top and start declining, which sets up non-confirmations in wave 5. | EWP L14 |
| 5 | Always less dynamic than wave 3 in breadth, and usually in speed of price change. Lower volume than wave 3 below Primary degree, unless wave 5 extends. "The stock market has no history of reaching maximum acceleration at a peak." Even in an extended fifth, the fifth of the fifth lacks dynamism. Optimism runs extremely high despite narrowing breadth. | EWP L14; Article |
| A | The investment world sees it as a pullback before the next leg up; the public buys. **A five-wave A means a zigzag; a three-wave A means a flat or triangle.** | EWP L14 |
| B | "Phonies… sucker plays, bull traps." Narrow focus, often unconfirmed by other averages, rarely technically strong, "virtually always doomed to complete retracement by wave C." "If the analyst can easily say to himself, 'There is something wrong with this market,' chances are it's a 'B' wave." Volume usually shrinks at Intermediate degree and lower. X waves and expanding-triangle D waves behave the same way. | EWP L14 |
| C | "Devastating in their destruction." Has most of the properties of a third wave: persistent and broad. Upward C waves inside bear markets unfold in five and are easily mistaken for a new bull. | EWP L14 |
| D | In non-expanding triangles, often comes with rising volume (part corrective, part first-wave-like), but "as phony as B waves." | EWP L14 |
| E | Looks like the dramatic start of a new trend, with strongly supportive news, and often makes a **false break through the triangle boundary** just before the reversal. | EWP L14 |

**Trading implication (Article):** reduce risk during the third sub-wave inside the larger wave 5. Chasing after a parabolic third wave is the classic mistake of buying high and selling low.

### Alternation (EWP L10)

- **Within impulses:** if wave 2 is sharp, expect wave 4 to be sideways, and vice versa.
  - Sharp corrections never make a new price extreme beyond the orthodox end of the prior impulse. They are almost always zigzags, occasionally double threes that begin with a zigzag.
  - Sideways corrections (flats, triangles, double and triple threes) usually do make that new extreme.
  - In rare cases a regular triangle in wave 4 stands in for the sharp correction.
- **Extensions alternate too:** wave 1 short, wave 3 extended, wave 5 short.
- ▲ **Diagonals don't alternate:** waves 2 and 4 are typically both zigzags.
- ▲ **Within corrections:** if wave A is a flat, expect wave B to be a zigzag, and vice versa. If A is a simple zigzag, B often stretches into a more complex zigzag.

### Flat types (EWP L7)

- Expanded flats are "far more common" than regular ones.
- A running flat is rare. EWP warns: "Never label a correction prematurely this way, or you'll find yourself wrong nine times out of ten." If the supposed B wave is a five, it is more likely wave 1 of the next impulse. rank-1.1.0 counts a running flat against its count ("flat.not_running").
- Flats "virtually always precede or follow extensions." The stronger the trend, the briefer the flat.
- Within impulses, fourth waves often take the form of flats; second waves rarely do. ▲ Second waves often take the form of zigzags; fourth waves rarely do (EWP L6).

### ▲ Triangles (EWP L8)

- Wave e overshoots or undershoots the a–c line "more often than not."
- **Running triangles are "extremely common"**: wave b exceeds the start of wave a. This is the opposite of running flats.
- Most triangle legs are zigzags. One leg (usually c) can be more complex. Rarely, wave e is itself a triangle.
- The time at which the boundary lines reach their apex often coincides with a market turn.

### Volume, channels and indicators (EWP L12, L13, L31)

- **Fifth-wave extension test:** below Primary degree, if wave 5's volume is equal to or greater than wave 3's, a fifth-wave extension is in force.
- A low point in volume often coincides with a turn. Late in a correction, falling volume means selling pressure is easing.
- **Throw-over:** a fifth wave approaching its upper channel line on declining volume will meet or fall short of it. Heavy volume means a possible throw-over, ending in a volume spike. A throw-under (by wave 4 or by wave 2 of 5) can telegraph it. Throw-overs are confirmed by an immediate reversal back inside the line.
- ▲ **Channel when wave 3 is near-vertical:** a parallel from wave 3's top may be too high. Draw the parallel to the 2–4 baseline from wave 1's top instead. It can help to draw both.
- ▲ **Scale:** if price doesn't sit neatly between parallels on one scale, switch to the other. The need for semilog suggests a wave that is accelerating. "The analyst should always use both."
- ▲ **Sentiment extremes** (short selling, options, polls) occur at the ends of C waves, second waves and fifth waves.
- ▲ **Momentum divergences** (slower price change, narrower breadth, and at lower degrees, lower volume) appear in fifth waves and in the B waves of expanded flats.
- Indicators are "tools to aid in correctly counting Elliott waves." Don't rely on them so much that you ignore wave counts of obvious portent.

### Evidence live in the ranking

- **Wave 3 dominance:** velocity and volume.
- **Wave 5 volume divergence.**
- **Alternation in time.**
- **Start at the prior extreme.**
- **Alternate-wave Fibonacci ratio** (rank-1.1.0).
- **Running flat rarity** (rank-1.1.0).

### Still to build

- **Corrective look:** waves 2 and 4 subdivide into threes. This needs multi-degree reconciliation.
- **Channel respect with volume.**
- See section 7 for candidates from EWP.

All weights are equal until a backtest justifies otherwise.

## 4. Choosing the preferred count (live)

EWP L15 and Essentials: "the analyst will generally regard as preferred the interpretation that satisfies the largest number of guidelines." Competent analysts "should usually agree on the order of probabilities."

- **Ranking:** Pattern Confidence = (checks met + 2) ÷ (checks measured + 4). It is never called a probability.
- **Alternate (rank-1.1.0):** the best-ranked count that tells a *different story*: a different pattern family, wave in progress, or direction. The same story from another starting point is not an alternate. EWP L15: "In the event that the market violates the expected scenario, the alternate count immediately becomes the investor's new preferred count. If you're thrown by your horse, it's useful to land right atop another."
- **Stops:** Basics and EWP L15 agree that rule levels are objective risk points. "If the market moves beyond what the apparently completed pattern allows, the conclusion is wrong, and any funds at risk can be reclaimed immediately."
- ▲ **Post-turn confirmation (EWP L15):** "A clear-cut three-wave rally following the minor low rather than the necessary five gives the signal" that the low was not major. What happens after a turn confirms or refutes it.
- ▲ **Unclear counts (EWP L15):** when no count is clearly preferred, wait. "Sweep it under the rug until the air clears." Viridia should say "no clear preference" rather than force a pick.
- ▲ **Real-time relabel rule (EWP L4, Figure 1-8):** when an apparent wave 3 breaks a rule (wave 4 overlaps wave 1, or wave 3 is shortest), the right relabel "is almost always" 1-2, 1-2: an extended wave 3 in the making. EWP calls this "perhaps the single most useful guide to real time impulse wave counting." The count generator should always offer this relabel.
- ▲ **Wave-count tally (EWP L9):** totals of 9, 13 or 17 waves with few overlaps are likely motive; 7, 11 or 15 with many overlaps are likely corrective. Diagonals are the exception.

### ▲ Individual stocks (EWP L28)

This matters directly for Viridia, which analyzes single stocks. EWP L28: for many individual issues, "the count… is often too fuzzy to be of great practical value… Elliott will tell you if the track is fast but not which horse is going to win." Emerging growth stocks give the clearest individual patterns. Large cyclicals and closed-end funds track the averages most closely. The advice is to act on a single stock "only… [when] a clear, unmistakable wave pattern unfolds before your eyes," but then to act on it regardless of the market's count.

**Engine implications (proposed, section 7):** a pattern-clarity gate before setups fire on single stocks, and showing the index's count as context.

### ▲ Commodities (EWP L29)

- Fifth-wave extensions are most common in commodity bull markets (driven by fear, not hope), often after a fourth-wave triangle. In stocks, post-triangle thrusts are "swift and short."
- Commodity target method: (start → wave 3 peak) × 0.618, added from a point within wave 4.
- Bull and bear markets can overlap, so the highest reliable degree is often Primary or Cycle.

## 5. Setups: buy and sell signals (setup-1.0.1, live)

A setup restates the preferred count as a trade. Every number comes from the count.

| Setup | Entry | Stop | Target | Source |
|---|---|---|---|---|
| Wave 3 under way | Close | Wave 1 origin (rule) | Wave 3 = 161.8% of wave 1 | EWF; Basics |
| Wave 5 under way | Close | Wave 1 end (rule) | Wave 5 = wave 1, or 61.8% of waves 1–3 | Essentials; EWP L21. Flagged as late in the trend, per the Article. |
| Wave C under way | Close | Start of A (rule) | C = A, or 1.618 × A | Essentials; EWP L21 |
| Wave 2 pullback (impulse only) | 61.8% retracement of wave 1 | Wave 1 origin | Wave 3 = 161.8% of wave 1 from the entry | Basics; EWF; EWP L20 |
| Wave 4 pullback (impulse only) | 38.2% retracement of wave 3 | Wave 1 end | Wave 5 = wave 1 from the entry | EWF; EWP L20 |
| Zigzag wave B | 61.8% retracement of A | Start of A | C = A from the entry | EWF; EWP L20–21 |
| Correction complete | Close | End of C (not a rule; "reassess") | 61.8% or 100% of A–C | Essentials |
| Five waves complete | Close | End of wave 5 (reassess) | Wave 4 of the finished impulse | Essentials; EWP L11, L21 (prior fourth and 38.2% retracement are "doubly indicated") |

**Gates**
- The stop and target must lie on the right sides of the entry, and price must not have reached either.
- Reward:risk must be at least 1:1.
- There are no pullback entries for diagonals: the sources give none, and a contracting diagonal's wave 5 must be shorter than wave 3.

**Not yet proven.** These are geometric definitions. A backtest by setup kind is the next step before anyone relies on them.

## 6. ▲ Depth of corrections and reversal targets (EWP L5, L11)

These are EWP's most specific "where does the next move end" guidelines. They feed setup targets.

| Situation | Expected end of the following correction | Source |
|---|---|---|
| Normal | Within the span of the previous fourth wave of one lesser degree, most commonly near its end. Strongest when the correction is itself a fourth wave. | EWP L11 |
| Wave 1 was extended | The correction after wave 5 typically bottoms at the low of **wave 2 of lesser degree** | EWP L11 |
| **Wave 5 was extended** | The correction is **sharp** and finds support at the **low of wave 2 of the extension**. EWP calls this "the most important empirically derived rule… a dramatic reversal to a specific level." It does not apply separately to fifth-of-fifth extensions. | EWP L11 |
| Zigzag that is a second wave | May cut deeper, into the area of the second wave of lesser degree | EWP L11 |
| Flat or triangle after an extension | May barely fail to reach the prior fourth wave area | EWP L11 |
| Ending diagonal | A rising diagonal is usually followed by a sharp decline that retraces **at least back to where the diagonal began** (inverted for falling diagonals) | EWP L5 |
| Fifth extension, truncation or ending diagonal | All "imply the same thing: dramatic reversal ahead." Two together at different degrees compound the violence. | EWP L5 |

## 7. ▲ Engine changes from EWP

**Live since 2026-10-22 (rules-1.1.0, rank-1.2.0).** These are evidence for Pattern Confidence only; none eliminates a count.
- `zigzag.c_vs_a` now also accepts C = 161.8% × A (EWP L21).
- `ewp.w5_extension_expected`: waves 1 ≈ 3 (within about 15%) → wave 5 should be extended (EWP L4).
- `ewp.w5_volume_extension`: wave 5 volume ≥ wave 3's → wave 5 should be extended (EWP L13).
- `ewp.w4_golden_section`: wave 4's start or end splits the impulse at 0.382 (or 0.618 with an extended fifth), unless wave 1 extended (EWP L21).
- `ewp.w4_vs_w2`: wave 4 = wave 2, or 0.618/1.618 of it (EWP L21).
- `ewp.sideways_w4`: one correction retraces about 50–61.8% (sharp), the other about 38.2% (sideways) (EWP L20).
- `ewp.expanded_flat_b`: expanded flat B ≈ 1.236 or 1.382 × A (EWP L21).
- `fib.alternate_ratio` for triangles now includes e:c, and uses 1.618 for expanding triangles (EWP L21).
- Ask Viridia's wave personalities (waves 1–5 and A–E) now follow EWP L14, and a finished impulse explains the post-extension reversal and three-wave confirmation (EWP L11, L15).

**Still proposals.** Each needs a decision, then code and a backtest. Most need sub-wave (multi-degree) structure first.

**Rules and counting (rules-1.1.0 candidates)**
1. **No five as a finished correction.** If the counter-trend leg since the last motive top subdivides into five, block "Correction complete" and treat the leg as wave A (or W). EWP L6.
2. **Pattern placement.**
   - Ending diagonals only in wave 5 or C (including the final C of a combination).
   - Leading diagonals only in wave 1 or A.
   - Triangles only in wave 4, B, the final X, or as the last component of a combination, and almost never in wave 2.
   - Combinations hold at most one zigzag and one triangle.
   - Source: EWP L5, L8, L9.
3. **Wave 3 of an impulse must itself be an impulse** (not a diagonal). EWP L4.
4. **Always offer the 1-2, 1-2 relabel** when an apparent wave 3 breaks a rule. EWP L4.
5. **Truncation check:** accept a truncated fifth only if wave 5 subdivides into five. It is most likely after a very strong wave 3. EWP L4.

**Ranking evidence (rank-1.2.0 candidates)**
1. **Fifth-wave volume ≥ wave 3** (below Primary degree) means a fifth extension is in force: favor extended-5 targets. EWP L13.
2. **Wave 1 ≈ wave 3** means expect an extended wave 5. **Wave 3 extended** means expect wave 5 ≈ wave 1. EWP L4.
3. **A-wave structure predicts B:** a five-wave A favors a zigzag; a three-wave A favors a flat or triangle. EWP L14.
4. **Alternation inside corrections:** a flat A favors a zigzag B, and vice versa. EWP L10.
5. **Diagonal 2 and 4 both zigzags** (no alternation expected). EWP L10.
6. **Leading diagonal vs 1-2, 1-2:** clear slowing in wave 5 versus wave 3 favors the diagonal. Accelerating speed with expanding breadth favors 1-2, 1-2. EWP L5.
7. **Momentum divergence** in wave 5 or in an expanded flat's B. EWP L31.
8. **Wave-count tally** (9/13/17 motive vs 7/11/15 corrective). EWP L9.

**Fibonacci and setups (fib-1.1.0 and setup-1.1.0 candidates)**
1. **New ratios:**
   - Zigzag C = 1.618 × A.
   - Expanded flat: C beyond A by 0.618 × A, B = 1.236 or 1.382 × A, and the rare C = 2.618 × A.
   - Regular flat: A ≈ B ≈ C.
   - Expanding triangle legs at 1.618.
   - Wave 4 vs wave 2 equality.
   - Source: EWP L21.
2. **Golden Section wave-5 targets from points within wave 4** (start, end and extreme), giving clustered targets. EWP L21.
3. **Triangle thrust target:** the widest width of the triangle, measured from its end. A clear overshoot flags a protracted fifth. EWP L8.
4. **Reversal targets after a completed impulse:**
   - Low of wave 2 of the extension (if wave 5 extended).
   - Low of wave 2 of lesser degree (if wave 1 extended).
   - Start of the diagonal (after an ending diagonal).
   - Source: EWP L5, L11.
5. **Cross-degree confluence:** zones built from several degrees score higher than single-degree zones. EWP L23.
6. **Time as evidence only:** Fibonacci bar counts and the 0.618 × advance duration add weight to a zone only when they coincide with a price target. EWP L25.

**Product and positioning**
1. **Single-stock clarity gate:** before a setup fires on an individual stock, require a clean count, meaning a high Pattern Confidence and a clear gap to the alternate. Otherwise show "no clear pattern" instead of a signal. EWP L28.
2. **Index context:** show the S&P 500's preferred count alongside a stock's count. EWP L28: 75% of stocks rise with the market and 90% fall with it.
3. **"No clear preference" state** when the top two counts are close. EWP L15.

## 8. ▲ Source conflicts to resolve

1. **Expanding diagonals.**
   - The rulebook accepts expanding diagonals and cites Frost & Prechter.
   - This edition of EWP (L5) found one possible case and says "we do not include it as a valid variation," because its third wave was shortest and another count was possible.
   - Essentials doesn't mention expanding diagonals at all.
   - **Proposed:** keep the rule, which matches later editions of the book, but have the ranking count an expanding diagonal against its count until a backtest says otherwise.
2. **Leading diagonal subdivisions.**
   - EWP (L5) defines a leading diagonal as 5-3-5-3-5.
   - The newer Essentials says the subdivisions "appear to be 3-3-3-3-3, although in some cases, they can be labeled 5-3-5-3-5, so the jury is out." It adds that a leading diagonal in wave 1 "is typically followed by a deep retracement."
   - **Proposed:** accept either subdivision for leading diagonals, and expect a deep wave 2 after one.
3. **Triangle types.** EWP lists symmetrical, ascending, descending and expanding triangles. Essentials names them contracting, barrier and expanding, plus running. These are naming differences, not rule differences. Viridia uses contracting and expanding, so no change is needed.

## 9. Change log

- **2026-09-25:** Created. Phase 6 Fibonacci engine built from sections 1–2. Article material recorded for Phase 7.
- **2026-09-28:** Updated for Cycles 2–3:
  - Phase 7 ranking is live (rank-1.0.0, then 1.1.0), with the alternate-ratio and running-flat checks.
  - The alternate must tell a different story.
  - Setups (section 5) and Ask Viridia's wave-personality answers are live.
- **2026-10-22:** Added the full Frost & Prechter *Elliott Wave Principle* course (34 lessons) as a primary source.
  - New: orthodox-endpoint measuring, the full ratio catalog, confluence, Fibonacci time, and full wave personality (A–E waves).
  - New: triangle and diagonal placement, correction-depth targets, and the individual-stocks caveat.
  - New: candidate engine changes (section 7) and three source conflicts (section 8).
  - Same day: shipped rules-1.1.0 and rank-1.2.0 (section 7, "Live").
