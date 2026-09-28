"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SIDEBAR, SIDEBAR_FOOTER, type NavItem } from "@/lib/nav";
import { Icon } from "./Icon";
import { useViewer } from "./ViewerProvider";

/** Terminal sidebar: grouped sections, a 56px icon rail when collapsed, a drawer on small screens. */
export function TerminalSidebar() {
  const path = usePathname();
  const { viewer } = useViewer();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("viridia.sidebar") === "collapsed"); } catch {}
    const toggle = () => setOpen((o) => !o);
    const collapse = () => setCollapsed((c) => { const v = !c; try { localStorage.setItem("viridia.sidebar", v ? "collapsed" : "open"); } catch {} return v; });
    window.addEventListener("viridia:toggle-nav", toggle);
    window.addEventListener("viridia:toggle-sidebar", collapse);
    return () => { window.removeEventListener("viridia:toggle-nav", toggle); window.removeEventListener("viridia:toggle-sidebar", collapse); };
  }, []);
  useEffect(() => setOpen(false), [path]);

  const isActive = (href: string) =>
    href === "/terminal" || href === "/markets" ? path === href : path === href || path.startsWith(href + "/");
  const rail = collapsed && !open; // the drawer is always full width

  const Item = ({ it }: { it: NavItem }) => {
    const href = it.auth && !viewer ? `/signin?next=${encodeURIComponent(it.href)}` : it.href;
    const active = isActive(it.href);
    return (
      <Link
        href={href} title={rail ? it.label : undefined} aria-current={active ? "page" : undefined}
        className={`flex h-8 items-center gap-2.5 rounded-[var(--r-md)] text-[13.5px] tracking-[-0.005em] transition-colors duration-[var(--t-fast)] ${
          rail ? "justify-center px-0" : "px-2.5"} ${
          active ? "bg-panel-2 font-[560] text-fg" : "text-fg-2 hover:bg-hover hover:text-fg"}`}
      >
        <Icon name={it.icon} className={`h-[16px] w-[16px] ${active ? "text-brand" : "text-fg-3"}`} />
        {!rail && <span className="truncate">{it.label}</span>}
      </Link>
    );
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-line bg-panel transition-[transform,width] duration-[var(--t-base)] lg:sticky lg:top-[56px] lg:z-10 lg:h-[calc(100vh-56px)] lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "lg:w-[56px]" : "lg:w-[224px]"}`}
        aria-label="Terminal navigation"
      >
        <nav className={`flex flex-1 flex-col overflow-y-auto pb-3 pt-3 ${rail ? "lg:px-2" : "px-3"}`}>
          {SIDEBAR.map((g, i) => (
            <div key={i} className={i ? "mt-4" : ""}>
              {g.group && (rail
                ? <div className="mx-2 mb-2 hidden h-px bg-line lg:block" />
                : <div className="mb-1 px-2.5 text-[11.5px] font-medium uppercase tracking-[0.04em] text-fg-3">{g.group}</div>)}
              <div className="flex flex-col gap-px">{g.items.map((it) => <Item key={it.href} it={it} />)}</div>
            </div>
          ))}
          <div className="mt-auto flex flex-col gap-px border-t border-line pt-3">
            {SIDEBAR_FOOTER.map((it) => <Item key={it.href} it={it} />)}
            <button
              className={`mt-1 hidden h-8 items-center gap-2.5 rounded-[var(--r-md)] text-[13px] text-fg-3 transition-colors hover:bg-hover hover:text-fg lg:flex ${rail ? "justify-center" : "px-2.5"}`}
              onClick={() => window.dispatchEvent(new Event("viridia:toggle-sidebar"))}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar  [" : "Collapse sidebar  ["}
            >
              <Icon name={collapsed ? "chevronRight" : "chevronLeft"} className="h-[16px] w-[16px]" />
              {!rail && "Collapse"}
            </button>
          </div>
        </nav>
      </aside>
    </>
  );
}
