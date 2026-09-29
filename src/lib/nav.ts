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
