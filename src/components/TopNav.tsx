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
 * The header: a dark band with the brand on the left, sections across (single sections are links,
 * the rest open a dropdown), and search, theme and account on the right. On small screens the
 * sections fold into one full-width menu.
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
    <header ref={bar} className="dark-band sticky top-0 z-40 border-b border-white/10">
      <div className="mx-auto flex h-[68px] max-w-[1600px] items-center gap-2 px-4 sm:px-6 lg:gap-6 lg:px-8">
        <Link href="/terminal" className="flex-none" aria-label="Viridia home"><ViridiaLockup light /></Link>

        <nav className="ml-2 hidden h-full items-stretch lg:flex xl:ml-4" aria-label="Sections">
          {HEADER_NAV.map((g) => {
            const active = g.items.some((it) => isActive(path, it.href));
            const cls = `relative inline-flex h-full items-center gap-1 whitespace-nowrap px-2.5 text-[14px] font-[600] xl:px-3 xl:text-[14.5px] tracking-[-0.005em] transition-colors duration-300 ${active ? "text-white" : "text-white/70 hover:text-white"}`;
            const underline = <span aria-hidden className={`absolute inset-x-2.5 bottom-0 h-[2px] origin-left bg-emerald transition-transform duration-500 ease-[var(--ease-premium)] ${active ? "scale-x-100" : "scale-x-0"}`} />;
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
                  <div className="absolute left-0 top-full z-50 pt-2">
                    <div className="w-[340px] overflow-hidden rounded-[14px] bg-panel p-2 text-fg" style={{ boxShadow: "var(--shadow-lg)", animation: "pop var(--t-base) var(--ease)" }}>
                      <p className="f-label px-3 pb-1 pt-2 text-fg-3">{g.label}</p>
                      <ul>
                        {g.items.map((it) => (
                          <li key={it.href} className="f-row last:border-b-0">
                            <Link href={hrefOf(it)} className="group flex items-center gap-3 rounded-[8px] px-3 py-2.5 transition-colors hover:bg-hover" aria-current={isActive(path, it.href) ? "page" : undefined}>
                              <Icon name={it.icon} className="h-[17px] w-[17px] flex-none text-brand" />
                              <span className="min-w-0 flex-1">
                                <span className={`block text-[14.5px] ${isActive(path, it.href) ? "font-[700]" : "font-[500]"}`}>{it.label}</span>
                                {NAV_BLURB[it.href] && <span className="block truncate text-[12.5px] font-[300] text-fg-2">{NAV_BLURB[it.href]}</span>}
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

        <div className="ml-auto flex flex-none items-center gap-1.5">
          <button
            className="hidden h-9 min-w-0 items-center gap-2.5 rounded-[var(--r-md)] border border-white/15 bg-white/[0.06] px-3 text-left text-[13px] text-white/70 transition-colors duration-300 hover:border-white/35 hover:text-white md:flex 2xl:w-[280px]"
            onClick={() => window.dispatchEvent(new Event("viridia:open-palette"))}
            aria-label="Search securities or ask Viridia" aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
          >
            <Icon name="search" />
            <span className="hidden min-w-0 flex-1 truncate 2xl:inline">Search or ask Viridia…</span>
            <kbd className="border-white/20 bg-transparent text-white/60">{mac ? "⌘K" : "Ctrl K"}</kbd>
          </button>
          <button className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--r-md)] text-white/75 transition-colors hover:bg-white/10 hover:text-white md:hidden" aria-label="Search" onClick={() => window.dispatchEvent(new Event("viridia:open-palette"))}>
            <Icon name="search" className="h-[18px] w-[18px]" />
          </button>
          <button
            className="hidden h-9 w-9 items-center justify-center rounded-[var(--r-md)] text-white/75 transition-colors hover:bg-white/10 hover:text-white sm:inline-flex"
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} title={dark ? "Light theme" : "Dark theme"}
            onClick={() => {
              const next = dark ? "light" : "dark";
              applyTheme(next);
              window.dispatchEvent(new CustomEvent("viridia:theme-changed", { detail: next }));
            }}
          >
            <Icon name={dark ? "sun" : "moon"} className="h-[17px] w-[17px]" />
          </button>
          <AccountMenu onDark />
          <button className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--r-md)] text-white transition-colors hover:bg-white/10 lg:hidden" aria-label={mobile ? "Close menu" : "Open menu"} aria-expanded={mobile} onClick={() => setMobile((v) => !v)}>
            <Icon name={mobile ? "x" : "menu"} className="h-[20px] w-[20px]" />
          </button>
        </div>
      </div>

      {mobile && (
        <nav className="max-h-[calc(100vh-68px)] overflow-y-auto border-t border-white/10 px-4 pb-8 pt-2 sm:px-6 lg:hidden" aria-label="Sections">
          {HEADER_NAV.map((g) => (
            <div key={g.label} className="border-b border-white/10 py-3">
              <p className="f-label pb-1 text-white/45">{g.label}</p>
              {g.items.map((it) => (
                <Link key={it.href} href={hrefOf(it)} className={`flex items-center gap-3 py-2 text-[18px] font-[300] ${isActive(path, it.href) ? "text-white" : "text-white/75"}`}>
                  <span className="flex-1">{it.label}</span>
                  <Icon name="chevronRight" className="h-[14px] w-[14px] text-white/45" />
                </Link>
              ))}
            </div>
          ))}
        </nav>
      )}
    </header>
  );
}
