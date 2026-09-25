export interface NavItem { label: string; href: string; live: boolean }

export const TOP_NAV: NavItem[] = [
  { label: "Terminal", href: "/terminal", live: true },
  { label: "Markets", href: "/markets", live: true },
  { label: "Scanner", href: "/scanner", live: true },
  { label: "Research", href: "/research", live: true },
  { label: "Watchlist", href: "/watchlist", live: false },
];

export const SIDEBAR: { group: string | null; items: NavItem[] }[] = [
  { group: null, items: [{ label: "Overview", href: "/terminal", live: true }] },
  { group: "Markets", items: [
    { label: "Market Overview", href: "/markets", live: true },
    { label: "Stocks", href: "/markets/stocks", live: true },
    { label: "ETFs", href: "/markets/etfs", live: true },
  ]},
  { group: "Analysis", items: [
    { label: "Wave Scanner", href: "/scanner", live: true },
    { label: "Rulebook", href: "/analysis/rulebook", live: true },
    { label: "Fibonacci", href: "/analysis/fibonacci", live: true },
    { label: "Market Structure", href: "/analysis/structure", live: false },
    { label: "Quant Rankings", href: "/analysis/rankings", live: false },
  ]},
  { group: "Research", items: [
    { label: "Company Research", href: "/research", live: true },
    { label: "Earnings", href: "/research/earnings", live: false },
    { label: "Filings", href: "/research/filings", live: false },
    { label: "Institutional", href: "/research/institutional", live: false },
    { label: "Insiders", href: "/research/insiders", live: false },
  ]},
  { group: "Personal", items: [
    { label: "Watchlist", href: "/watchlist", live: false },
    { label: "Portfolio", href: "/portfolio", live: false },
    { label: "Alerts", href: "/alerts", live: false },
  ]},
];

export const SIDEBAR_FOOTER: NavItem[] = [
  { label: "Settings", href: "/settings", live: false },
  { label: "Data Sources", href: "/data-sources", live: true },
];

/** What each planned section will contain and which build phase delivers it. Keyed by path. */
export const PLANNED: Record<string, { title: string; phase: string; summary: string; items: string[] }> = {
  "analysis/fibonacci": { title: "Fibonacci", phase: "Phase 6", summary: "Retracements, extensions and confluence zones anchored to the active wave count, never to arbitrary highs and lows.",
    items: ["Wave-anchored retracements: 0.382, 0.500, 0.618, 0.786", "Extensions and projections: 1.000, 1.618, 2.618", "Confluence zones scored by overlapping relationships", "Each level records its start pivot, end pivot and wave relationship"] },
  "analysis/structure": { title: "Market Structure", phase: "Phases 3–9", summary: "Pivots, trend classification and wave degree across 1H, 4H, 1D, 1W and 1M.",
    items: ["Adaptive pivot detection scaled to volatility", "Higher-high / higher-low trend structure", "Primary, intermediate and minor trend", "Multi-timeframe consistency"] },
  "analysis/rankings": { title: "Quant Rankings", phase: "After Phase 7", summary: "Securities ranked by pattern confidence, confluence and trend alignment, each score explained input by input.",
    items: ["Sortable by any factor", "Sector-relative ranks", "Score changes over time"] },
  "research/earnings": { title: "Earnings", phase: "Later", summary: "Calendar, surprises and an earnings-call workspace with cited answers.", items: ["Earnings calendar", "Surprise history", "Transcript questions with citations"] },
  "research/filings": { title: "Filings", phase: "Later", summary: "EDGAR filings linked through each company's CIK, already stored for 7,500+ companies.", items: ["10-K, 10-Q, 8-K browser", "Filing comparison"] },
  "research/institutional": { title: "Institutional", phase: "Later", summary: "13F ownership changes by quarter.", items: ["Holder changes", "Net institutional buying"] },
  "research/insiders": { title: "Insiders", phase: "Later", summary: "Form 4 transactions, classified.", items: ["Open-market purchases versus grants", "90-day net activity"] },
  watchlist: { title: "Watchlist", phase: "With accounts", summary: "Named watchlists saved to your account, with alerts on invalidation levels.", items: ["Multiple lists", "Structure changes highlighted", "Invalidation alerts"] },
  portfolio: { title: "Portfolio", phase: "Later", summary: "Holdings with exposure, risk and structure across positions.", items: ["Sector and factor exposure", "Volatility, drawdown, beta"] },
  alerts: { title: "Alerts", phase: "With accounts", summary: "Notifications when price reaches a Fibonacci zone, crosses an invalidation level or a count changes.", items: ["Price and zone alerts", "Invalidation alerts", "Count-change alerts"] },
  settings: { title: "Settings", phase: "With accounts", summary: "Theme, data preferences and alert delivery.", items: ["Theme", "Default timeframe", "Alert channels"] },
};
