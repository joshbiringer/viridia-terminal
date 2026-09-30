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
  { label: "Data & Methodology", href: "/data-sources", icon: "data", live: true, keywords: "sources coverage methodology limitations integrity" },
  { label: "Help", href: "/help", icon: "help", live: true, keywords: "shortcuts keyboard support" },
];

export const ALL_NAV: NavItem[] = [...SIDEBAR.flatMap((g) => g.items), ...SIDEBAR_FOOTER];

/** One line under each item in the header's dropdown menus. */
export const NAV_BLURB: Record<string, string> = {
  "/terminal": "What changed, signals and your day",
  "/research": "Search any covered company",
  "/analysis/fibonacci": "Confluence zones across the market",
  "/analysis/rulebook": "The Elliott Wave rules Viridia enforces",
  "/markets": "Breadth, regime and activity",
  "/markets/stocks": "Every covered U.S. stock",
  "/markets/etfs": "Every covered ETF",
  "/scanner": "Screen by structure, wave and Fibonacci",
  "/setups": "Structural scenarios that pass every check",
  "/setups/track-record": "How each kind of setup has done",
  "/portfolio": "Exposure, risk, structure and tax",
  "/watchlist": "Your names and what changed",
  "/data-sources": "Sources, coverage and limitations",
  "/help": "Guides and keyboard shortcuts",
};

/**
 * Header navigation: single sections are direct links, the rest open a dropdown. Built from the same
 * SIDEBAR list the command palette searches, so the two never disagree.
 */
export const HEADER_NAV: { label: string; items: NavItem[] }[] = [
  ...SIDEBAR.map((g) => ({ label: g.items.length === 1 ? (g.group === "Portfolio" ? "Portfolio" : g.items[0].label) : g.group ?? g.items[0].label, items: g.items })),
  { label: "Resources", items: SIDEBAR_FOOTER.filter((i) => i.href !== "/account") },
];
