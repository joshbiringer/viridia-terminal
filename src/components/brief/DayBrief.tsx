"use client";

import { useState, useSyncExternalStore } from "react";
import { HUBS, hubStatus } from "@/lib/market-sessions";
import { dayBriefText, type DaySection } from "@/lib/analysis/mission";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const noop = () => () => {};

/** World sessions need the reader's clock, so they are added in the browser only. */
function sessionsNow(): DaySection {
  const now = new Date();
  return { heading: "World sessions", lines: HUBS.filter((h) => h.id !== "sf").map((h) => {
    const s = hubStatus(h, now);
    return `${h.city}: ${s.state === "open" ? "open" : s.state === "break" ? "midday break" : "closed"}, ${s.localTime} local. ${s.next}.`;
  }) };
}
let cached: { at: number; s: DaySection } | null = null;
const snapshot = () => {
  if (!cached || Date.now() - cached.at > 60_000) cached = { at: Date.now(), s: sessionsNow() };
  return cached.s;
};

/** The day brief body with Copy and Print; the sections come from the server. */
export function DayBrief({ title, sections }: { title: string; sections: DaySection[] }) {
  const [copied, setCopied] = useState(false);
  const sessions = useSyncExternalStore(noop, snapshot, () => null);
  const all = [...sections, ...(sessions ? [sessions] : [])];
  const text = dayBriefText(title, all);

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  const print = () => {
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#10231c;max-width:680px;margin:32px auto;padding:0 16px}h1{font-size:20px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#4b635a;margin:20px 0 6px}ul{padding-left:18px;margin:0}li{margin:3px 0}</style>
<h1>${esc(title)}</h1>${all.map((s) => `<h2>${esc(s.heading)}</h2><ul>${s.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`).join("")}
<p style="margin-top:24px;font-size:12px;color:#6b7f78">Research compiled from Viridia's structural model and stored end-of-day data. Not a recommendation.</p>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <article className="card" aria-label={title}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <h1 className="text-[17px] font-[650] tracking-[-0.015em]">{title}</h1>
        <span className="ml-auto flex gap-1.5">
          <button className="btn sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          <button className="btn sm" onClick={print}>Print</button>
        </span>
      </div>
      <div className="divide-y divide-line">
        {all.map((s) => (
          <section key={s.heading} className="grid gap-1 px-5 py-3 md:grid-cols-[180px_minmax(0,1fr)] md:gap-4">
            <h2 className="pt-0.5 text-[11.5px] font-[600] uppercase tracking-[0.06em] text-fg-3">{s.heading}</h2>
            {s.lines.length ? (
              <ul className="flex flex-col gap-1 text-[13.5px] leading-snug text-fg-2">
                {s.lines.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            ) : <p className="text-[13px] text-fg-3">Nothing to report.</p>}
          </section>
        ))}
      </div>
      <div className="src"><span>Compiled from Viridia&apos;s structural model and stored end-of-day data. Research output, not a recommendation.</span></div>
    </article>
  );
}
