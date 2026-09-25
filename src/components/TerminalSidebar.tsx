"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SIDEBAR, SIDEBAR_FOOTER, TOP_NAV, type NavItem } from "@/lib/nav";
import { Icon } from "./Icon";

export function TerminalSidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);           // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("viridia.sidebar") === "collapsed"); } catch {}
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("viridia:toggle-nav", toggle);
    return () => window.removeEventListener("viridia:toggle-nav", toggle);
  }, []);
  useEffect(() => setOpen(false), [path]);

  const setCollapse = (v: boolean) => {
    setCollapsed(v);
    try { localStorage.setItem("viridia.sidebar", v ? "collapsed" : "open"); } catch {}
  };
  const isActive = (href: string) =>
    href === "/terminal" ? path === "/terminal" : href === "/markets" ? path === "/markets" : path === href || path.startsWith(href + "/");

  const Item = ({ it }: { it: NavItem }) => (
    <Link
      href={it.href}
      className={`group flex items-center gap-2 rounded-lg px-3 py-[7px] text-[13.5px] tracking-[-0.005em] transition-colors ${
        isActive(it.href) ? "bg-panel-2 font-[560] text-fg" : "text-fg-2 hover:bg-hover hover:text-fg"}`}
    >
      {isActive(it.href) && <span className="-ml-1 h-3.5 w-[2px] rounded bg-brand" aria-hidden />}
      <span className="truncate">{it.label}</span>
      {!it.live && <span className="ml-auto text-[11px] text-fg-3 opacity-80">Soon</span>}
    </Link>
  );

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-line bg-panel transition-transform lg:sticky lg:top-[60px] lg:z-10 lg:h-[calc(100vh-60px)] lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "lg:w-[56px]" : "lg:w-[232px]"}`}
        aria-label="Terminal navigation"
      >
        {collapsed ? (
          <div className="hidden flex-1 flex-col items-center gap-2 pt-3 lg:flex">
            <button className="btn ghost sm px-2" onClick={() => setCollapse(false)} aria-label="Expand sidebar" title="Expand sidebar">
              <Icon d="M9 6l6 6-6 6" />
            </button>
          </div>
        ) : null}
        <div className={`flex flex-1 flex-col overflow-y-auto px-3 pb-3 pt-4 ${collapsed ? "lg:hidden" : ""}`}>
          <nav className="flex flex-col gap-0.5 md:hidden" aria-label="Primary">
            {TOP_NAV.map((n) => <Item key={n.href} it={n} />)}
            <div className="my-3 h-px bg-line" />
          </nav>
          {SIDEBAR.map((g, i) => (
            <div key={i} className={i ? "mt-5" : ""}>
              {g.group && <div className="mb-1 px-3 text-[12px] font-medium text-fg-3">{g.group}</div>}
              <div className="flex flex-col gap-0.5">{g.items.map((it) => <Item key={it.href} it={it} />)}</div>
            </div>
          ))}
          <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3">
            {SIDEBAR_FOOTER.map((it) => <Item key={it.href} it={it} />)}
            <button
              className="mt-1 hidden items-center gap-2 rounded-lg px-3 py-[7px] text-[13px] text-fg-3 hover:bg-hover hover:text-fg lg:flex"
              onClick={() => setCollapse(true)}
            >
              <Icon d="M15 6l-6 6 6 6" /> Collapse
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
