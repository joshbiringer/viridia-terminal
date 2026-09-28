import type { IconName } from "@/components/Icon";

export interface NavItem { label: string; href: string; icon: IconName; live: boolean; auth?: boolean; keywords?: string }

/**
 * Terminal navigation. Only sections that work today are listed; planned sections live on the
 * roadmap (Data Sources) instead of sending people to placeholder pages.
 */
export const SIDEBAR: { group: string | null; items: NavItem[] }[] = [
  { group: "Terminal", items: [
    { label: "Mission Control", href: "/terminal", icon: "home", live: true, keywords: "home overview dashboard what changed briefing brief prepare my day" },
  ]},
  { group: "Research", items: [
    { label: "Company Research", href: "/research", icon: "research", live: true, keywords: "company search" },
    { label: "Fibonacci", href: "/analysis/fibonacci", icon: "fib", live: true, keywords: "confluence zones retracement" },
    { label: "Rulebook", href: "/analysis/rulebook", icon: "rulebook", live: true, keywords: "elliott wave rules guidelines" },
  ]},
  { group: "Markets", items: [
    { label: "Markets", href: "/markets", icon: "markets", live: true, keywords: "overview breadth indices most active activity" },
    { label: "Stocks", href: "/markets/stocks", icon: "stocks", live: true, keywords: "equities list" },
    { label: "ETFs", href: "/markets/etfs", icon: "etf", live: true, keywords: "funds" },
  ]},
  { group: "Scanner", items: [
    { label: "Wave Scanner", href: "/scanner", icon: "scanner", live: true, keywords: "screen screener filter" },
    { label: "Setups", href: "/setups", icon: "target", live: true, keywords: "signals buy sell trade entry stop target" },
    { label: "Track Record", href: "/setups/track-record", icon: "check", live: true, keywords: "backtest history performance hit rate" },
  ]},
  { group: "Portfolio", items: [
    { label: "Portfolio X-Ray", href: "/portfolio", icon: "gauge", live: true, keywords: "holdings concentration risk beta correlation tax upload csv" },
  ]},
  { group: "Workspace", items: [
    { label: "Watchlist", href: "/watchlist", icon: "watchlist", live: true, auth: true, keywords: "favorites saved" },
  ]},
];

export const SIDEBAR_FOOTER: NavItem[] = [
  { label: "Account", href: "/account", icon: "account", live: true, auth: true, keywords: "profile billing plan settings" },
  { label: "Data Sources", href: "/data-sources", icon: "data", live: true, keywords: "roadmap status coverage" },
  { label: "Help", href: "/help", icon: "help", live: true, keywords: "shortcuts keyboard support" },
];

export const ALL_NAV: NavItem[] = [...SIDEBAR.flatMap((g) => g.items), ...SIDEBAR_FOOTER];

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
