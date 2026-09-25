"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { TOP_NAV } from "@/lib/nav";
import { ViridiaLockup } from "./ViridiaMark";
import { Icon } from "./Icon";

export function TopNav() {
  const path = usePathname();
  const [mac, setMac] = useState(true);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.userAgent)), []);
  const active = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <header className="sticky top-0 z-30 flex h-[60px] flex-none items-center gap-3 border-b border-line bg-panel/95 px-4 backdrop-blur-[2px] sm:px-6">
      <button
        className="btn ghost sm -ml-2 lg:hidden" aria-label="Open navigation"
        onClick={() => window.dispatchEvent(new Event("viridia:toggle-nav"))}
      >
        <Icon d="M4 7h16M4 12h16M4 17h16" className="h-[18px] w-[18px]" />
      </button>
      <Link href="/" className="mr-4 flex-none" aria-label="Viridia home"><ViridiaLockup /></Link>
      <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
        {TOP_NAV.map((n) => (
          <Link
            key={n.href} href={n.href}
            className={`rounded-lg px-3 py-1.5 text-[14px] font-[550] tracking-[-0.01em] transition-colors ${active(n.href) ? "text-fg" : "text-fg-2 hover:text-fg"}`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <button
        className="ml-auto flex h-9 w-full max-w-[380px] min-w-0 items-center gap-2.5 rounded-[9px] border border-line bg-bg px-3 text-left text-[13.5px] text-fg-3 transition-colors hover:border-line-2"
        onClick={() => window.dispatchEvent(new Event("viridia:open-palette"))}
        aria-label="Search markets"
      >
        <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3" />
        <span className="min-w-0 flex-1 truncate">Search markets…</span>
        <kbd className="hidden sm:inline">{mac ? "⌘ K" : "Ctrl K"}</kbd>
      </button>
      <Link href="/alerts" className="btn ghost sm hidden text-fg-2 sm:inline-flex" aria-label="Alerts">
        <Icon d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" className="h-[17px] w-[17px]" />
      </Link>
      <button
        className="btn ghost sm px-2 text-fg-2" aria-label="Toggle light or dark theme"
        onClick={() => {
          const el = document.documentElement;
          const next = el.dataset.theme === "dark" ? "light" : "dark";
          el.dataset.theme = next;
          try { localStorage.setItem("viridia.theme", next); } catch {}
        }}
      >
        <Icon d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" className="h-[17px] w-[17px]" />
      </button>
      <span
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-panel-2 text-[12px] font-semibold text-brand ring-1 ring-line"
        title="Accounts arrive with sign-in" aria-label="Account (sign-in coming soon)"
      >
        V
      </span>
    </header>
  );
}
