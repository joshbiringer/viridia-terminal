/**
 * One icon set for the whole app: 24×24 stroked paths at 1.6px, drawn to a shared grid.
 * Use a named icon (`<Icon name="search" />`) wherever possible; raw paths (`d`) remain for one-off marks.
 */
export const ICONS = {
  home: "M4 11.5 12 5l8 6.5M6 10v9h4.5v-5h3v5H18v-9",
  markets: "M4 19h16M6 16V11M10 16V7M14 16v-6M18 16V5",
  stocks: "M4 17l5-5 4 3 7-8M15 7h5v5",
  etf: "M5 5h14v14H5zM5 12h14M12 5v14",
  scanner: "M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 12h8M12 8v8",
  fib: "M4 19h16M4 15h16M4 10.5h16M4 5h16M7 5l10 14",
  rulebook: "M6 4h11a1 1 0 0 1 1 1v15H7a1 1 0 0 1-1-1zM6 17h12M9 8h6M9 11h4",
  research: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3M8 11h6",
  watchlist: "M12 4.5l2.3 4.7 5.2.8-3.75 3.65.9 5.15L12 16.4l-4.65 2.4.9-5.15L4.5 10l5.2-.8z",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  data: "M4 6c0-1.1 3.6-2 8-2s8 .9 8 2-3.6 2-8 2-8-.9-8-2zM4 6v12c0 1.1 3.6 2 8 2s8-.9 8-2V6M4 12c0 1.1 3.6 2 8 2s8-.9 8-2",
  account: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0",
  settings: "M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.2a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7M12 17h.01",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3",
  moon: "M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  logout: "M15 17l5-5-5-5M20 12H9M11 20H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6",
  plus: "M12 5v14M5 12h14",
  target: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6 6 18",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  menu: "M4 7h16M4 12h16M4 17h16",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  keyboard: "M3 7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
  sparkle: "M12 4l1.8 4.7L18.5 10l-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.3z",
  trash: "M5 7h14M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z",
  card: "M3 7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 10h18M7 15h3",
  gauge: "M4 17a8 8 0 1 1 16 0M12 17l4-5",
  sliders: "M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4",
  shield: "M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, d, className = "h-[15px] w-[15px]" }: { name?: IconName; d?: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} flex-none fill-none stroke-current`} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d={name ? ICONS[name] : d} />
    </svg>
  );
}
