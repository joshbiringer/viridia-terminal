"use client";
/**
 * Recently opened securities and research (scanner queries, portfolios, pages), kept in this
 * browser only. A convenience for the command bar; nothing is sent anywhere.
 */
export interface RecentItem { kind: "security" | "research"; label: string; sub?: string; href: string; t: number }
const KEY = "viridia.recent.v1";

export function readRecent(): RecentItem[] {
  try { return (JSON.parse(localStorage.getItem(KEY) ?? "[]") as RecentItem[]).filter((r) => r && r.href && r.label); } catch { return []; }
}

export function pushRecent(item: Omit<RecentItem, "t">) {
  try {
    const list = [{ ...item, t: Date.now() }, ...readRecent().filter((r) => r.href !== item.href)].slice(0, 12);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* storage blocked */ }
}
