/**
 * What an account includes today. This is the single source for plan copy in the product. There is
 * no payment processor and no paid plan yet, so nothing here names a price, a limit or a renewal.
 * When billing ships, plan data moves to the database (per-user subscription rows) and this file
 * becomes the catalog of plan features.
 */
export const CURRENT_PLAN = {
  name: "Viridia Beta",
  price: "Free",
  summary: "Every feature in Viridia is included while the product is in beta. There is no card on file and nothing is billed.",
  includes: [
    "Every U.S.-listed stock and ETF, with daily price history",
    "Candidate Elliott Wave counts checked against the hard rules",
    "Fibonacci targets and confluence zones",
    "Wave Scanner and market-wide Fibonacci screen",
    "Watchlists",
  ],
  notYet: ["Alerts", "Portfolio analysis", "AI research answers", "Intraday data beyond 1H/4H charts"],
} as const;
