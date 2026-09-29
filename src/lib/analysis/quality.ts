/** Setup quality grades from the replayed track record (migration 0024), client-safe. */
export type Grade = "positive" | "mixed" | "negative" | "thin";

export const GRADE_LABEL: Record<Grade, string> = {
  positive: "Positive record", mixed: "Mixed record", negative: "Negative record", thin: "Little history",
};

export const QUALITY_METHOD =
  "Each setup kind and side is graded from its replayed trials, split at the median trial date so the two halves test each other out of sample. Positive: average at least +0.05R overall and above zero in both halves. Negative: at most −0.05R overall and below zero in both halves. Mixed: anything else. Little history: under 100 resolved cases or under 40 in either half. The replay covers a year in which U.S. stocks mostly rose, which favors bullish setups.";

export const GRADE_TONE: Record<Grade, string> = { positive: "var(--pos)", mixed: "var(--text-2)", negative: "var(--neg)", thin: "var(--text-3)" };
