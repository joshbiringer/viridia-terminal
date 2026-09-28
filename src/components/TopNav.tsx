"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ViridiaLockup } from "./ViridiaMark";
import { Icon } from "./Icon";
import { AccountMenu } from "./AccountMenu";
import { applyTheme } from "@/lib/theme";

/** Terminal top bar: brand, the command search (the primary way around Viridia), theme, account. */
export function TopNav() {
  const [mac, setMac] = useState(true);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.userAgent));
    const sync = () => setDark(document.documentElement.dataset.theme === "dark");
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-[56px] flex-none items-center gap-3 border-b border-line bg-panel/95 px-3 backdrop-blur-[2px] sm:px-4">
      <button className="btn ghost sm px-2 lg:hidden" aria-label="Open navigation" onClick={() => window.dispatchEvent(new Event("viridia:toggle-nav"))}>
        <Icon name="menu" className="h-[18px] w-[18px]" />
      </button>
      <Link href="/terminal" className="flex-none lg:w-[200px] lg:pl-1.5" aria-label="Viridia home"><ViridiaLockup /></Link>
      <button
        className="mx-auto hidden h-9 w-full max-w-[560px] min-w-0 items-center sm:flex gap-2.5 rounded-[var(--r-md)] border border-line bg-bg px-3 text-left text-[13.5px] text-fg-3 transition-colors duration-[var(--t-fast)] hover:border-line-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        onClick={() => window.dispatchEvent(new Event("viridia:open-palette"))}
        aria-label="Search stocks, ETFs and commands" aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
      >
        <Icon name="search" />
        <span className="min-w-0 flex-1 truncate">Search stocks, ETFs and commands…</span>
        <kbd className="hidden sm:inline">{mac ? "⌘ K" : "Ctrl K"}</kbd>
      </button>
      <button
        className="btn ghost sm ml-auto px-2 text-fg-2 sm:hidden" aria-label="Search" onClick={() => window.dispatchEvent(new Event("viridia:open-palette"))}
      >
        <Icon name="search" className="h-[18px] w-[18px]" />
      </button>
      <button
        className="btn ghost sm hidden px-2 text-fg-2 sm:inline-flex" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
        title={dark ? "Light theme" : "Dark theme"}
        onClick={() => {
          const next = dark ? "light" : "dark";
          applyTheme(next);
          window.dispatchEvent(new CustomEvent("viridia:theme-changed", { detail: next }));
        }}
      >
        <Icon name={dark ? "sun" : "moon"} className="h-[17px] w-[17px]" />
      </button>
      <AccountMenu />
    </header>
  );
}
