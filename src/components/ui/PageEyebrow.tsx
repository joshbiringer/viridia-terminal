"use client";

import { usePathname } from "next/navigation";
import { HEADER_NAV } from "@/lib/nav";

/** The section a page belongs to, as a mono eyebrow ("Scanner", "Markets"…). */
export function PageEyebrow() {
  const path = usePathname();
  const g = HEADER_NAV.find((x) => x.items.some((it) => path === it.href || path.startsWith(it.href + "/")));
  return g ? <p className="f-eyebrow mb-3 text-brand">{g.items.length === 1 ? g.items[0].label : g.label}</p> : null;
}
