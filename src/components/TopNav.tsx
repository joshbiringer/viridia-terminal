"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ViridiaLockup } from "./ViridiaMark";
import { Icon } from "./Icon";
import { AccountMenu } from "./AccountMenu";
import { useViewer } from "./ViewerProvider";
import { applyTheme } from "@/lib/theme";
import { HEADER_NAV, NAV_BLURB, type NavItem } from "@/lib/nav";

const isActive = (path: string, href: string) =>
  href === "/terminal" || href === "/markets" || href === "/setups" ? path === href || (href === "/terminal" && path === "/brief") : path === href || path.startsWith(href + "/");

/**
 * The header: a light, translucent bar with the brand on the left, the sections in a frosted pill
 * in the middle (single sections are links, the rest open a dropdown; the active one is an ink pill),
 * and search, theme and account on the right. On small screens the sections fold into one menu.
 */
export function TopNav() {
  const path = usePathname();
  const { viewer } = useViewer();
  const [mac, setMac] = useState(true);
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const bar = useRef<HTMLElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.userAgent));
    const sync = () => setDark(document.documentElement.dataset.theme === "dark");
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  // close menus on navigation, Escape and outside clicks
  const [navPath, setNavPath] = useState(path);
  if (navPath !== path) { setNavPath(path); setOpen(null); setMobile(false); }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(null); setMobile(false); } };
    const onDown = (e: MouseEvent) => { if (!bar.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, []);

  const hrefOf = (it: NavItem) => (it.auth && !viewer ? `/signin?next=${encodeURIComponent(it.href)}` : it.href);
  const enter = (label: string) => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(label); };
  const leave = () => { closeTimer.current = setTimeout(() => setOpen(null), 160); };

  return (
    <header ref={bar} className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--bg)_78%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-[1600px] items-center gap-2 px-4 sm:px-6 lg:gap-4 lg:px-8">
        <Link href="/terminal" className="flex-none" aria-label="Viridia home"><ViridiaLockup /></Link>

        <nav className="glass mx-auto hidden h-11 items-center gap-0.5 rounded-full px-1.5 shadow-[var(--shadow-sm)] xl:flex" aria-label="Sections">
          {HEADER_NAV.map((g) => {
            const active = g.items.some((it) => isActive(path, it.href));
            const cls = `relative inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full px-3 text-[13.5px] font-[500] tracking-[-0.01em] transition-colors duration-200 xl:px-3.5 ${active ? "bg-ink text-panel shadow-[var(--shadow-sm)]" : "text-fg-2 hover:bg-hover hover:text-fg"}`;
            const underline = null;
            if (g.items.length === 1) return <Link key={g.label} href={hrefOf(g.items[0])} className={cls} aria-current={active ? "page" : undefined}>{g.label}{underline}</Link>;
            const isOpen = open === g.label;
            return (
              <div key={g.label} className="relative flex" onMouseEnter={() => enter(g.label)} onMouseLeave={leave}>
                <button className={cls} aria-expanded={isOpen} aria-haspopup="true" onClick={() => setOpen(isOpen ? null : g.label)}>
                  {g.label}
                  <Icon name="chevronDown" className={`h-[14px] w-[14px] transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                  {underline}
                </button>
                {isOpen && (
                  <div className="absolute left-0 top-full z-50 pt-3">
                    <div className="w-[340px] overflow-hidden rounded-[20px] border border-line bg-panel p-2 text-fg" style={{ boxShadow: "var(--shadow-lg)", animation: "pop var(--t-base) var(--ease)" }}>
                      <p className="f-label px-3 pb-1 pt-2 text-fg-3">{g.label}</p>
                      <ul>
                        {g.items.map((it) => (
                          <li key={it.href} className="f-row last:border-b-0">
                            <Link href={hrefOf(it)} className="group flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors hover:bg-hover" aria-current={isActive(path, it.href) ? "page" : undefined}>
                              <Icon name={it.icon} className="h-[17px] w-[17px] flex-none text-brand" />
                              <span className="min-w-0 flex-1">
                                <span className={`block text-[14px] ${isActive(path, it.href) ? "font-[650]" : "font-[500]"}`}>{it.label}</span>
                                {NAV_BLURB[it.href] && <span className="block truncate text-[12.5px] text-fg-3">{NAV_BLURB[it.href]}</span>}
                              </span>
                              <span className="f-arrow h-7 w-7"><Icon name="chevronRight" className="h-[13px] w-[13px]" /></span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex flex-none items-center gap-1.5 xl:ml-0">
          <button
            className="hidden h-10 min-w-0 items-center gap-2.5 rounded-full border border-line bg-panel px-3.5 text-left text-[13px] text-fg-3 shadow-[var(--shadow-sm)] transition-colors duration-200 hover:border-line-2 hover:text-fg md:flex 2xl:w-[240px]"
            onClick={() => window.dispatchEvent(new Event("viridia:open-palette"))}
            aria-label="Search securities or ask Viridia" aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
          >
            <Icon name="search" />
            <span className="hidden min-w-0 flex-1 truncate 2xl:inline">Search or ask Viridia…</span>
            <kbd className="hidden xl:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
          </button>
          <button className="inline-flex h-10 w-10 items-center justify-center rounded-full text-fg-2 transition-colors hover:bg-hover hover:text-fg md:hidden" aria-label="Search" onClick={() => window.dispatchEvent(new Event("viridia:open-palette"))}>
            <Icon name="search" className="h-[18px] w-[18px]" />
          </button>
          <button
            className="hidden h-10 w-10 items-center justify-center rounded-full text-fg-2 transition-colors hover:bg-hover hover:text-fg sm:inline-flex"
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} title={dark ? "Light theme" : "Dark theme"}
            onClick={() => {
              const next = dark ? "light" : "dark";
              applyTheme(next);
              window.dispatchEvent(new CustomEvent("viridia:theme-changed", { detail: next }));
            }}
          >
            <Icon name={dark ? "sun" : "moon"} className="h-[17px] w-[17px]" />
          </button>
          <AccountMenu />
          <button className="inline-flex h-10 w-10 items-center justify-center rounded-full text-fg transition-colors hover:bg-hover xl:hidden" aria-label={mobile ? "Close menu" : "Open menu"} aria-expanded={mobile} onClick={() => setMobile((v) => !v)}>
            <Icon name={mobile ? "x" : "menu"} className="h-[20px] w-[20px]" />
          </button>
        </div>
      </div>

      {mobile && (
        <nav className="max-h-[calc(100vh-68px)] overflow-y-auto border-t border-line bg-bg px-4 pb-8 pt-2 sm:px-6 xl:hidden" aria-label="Sections">
          {HEADER_NAV.map((g) => (
            <div key={g.label} className="border-b border-line py-3">
              <p className="f-label pb-1">{g.label}</p>
              {g.items.map((it) => (
                <Link key={it.href} href={hrefOf(it)} className={`flex items-center gap-3 py-2 text-[17px] font-[500] tracking-[-0.015em] ${isActive(path, it.href) ? "text-fg" : "text-fg-2"}`}>
                  <span className="flex-1">{it.label}</span>
                  <Icon name="chevronRight" className="h-[14px] w-[14px] text-fg-3" />
                </Link>
              ))}
            </div>
          ))}
        </nav>
      )}
    </header>
  );
}
