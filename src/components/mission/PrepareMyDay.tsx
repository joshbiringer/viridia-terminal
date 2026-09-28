"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { HUBS, hubStatus } from "@/lib/market-sessions";
import { dayBriefText, type DaySection } from "@/lib/analysis/mission";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Prepare My Day: one compiled page of the day's context (market, regime, what changed, watchlist,
 * setups and world sessions) to read, copy or print before the first meeting. Meetings, clients and
 * calendars aren't connected, and the brief says so instead of inventing them.
 */
export function PrepareMyDay({ title, sections, className = "" }: { title: string; sections: DaySection[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sessions, setSessions] = useState<DaySection | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  const show = () => {
    const now = new Date();
    setSessions({ heading: "World sessions", lines: HUBS.filter((h) => h.id !== "sf").map((h) => {
      const s = hubStatus(h, now);
      return `${h.city}: ${s.state === "open" ? "open" : s.state === "break" ? "midday break" : "closed"}, ${s.localTime} local. ${s.next}.`;
    }) });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const all: DaySection[] = [...sections, ...(sessions ? [sessions] : []), {
    heading: "Not connected yet",
    lines: ["Meetings and client lists: no calendar or CRM is connected.", "Economic and earnings calendars: no data source yet."],
  }];
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
<p style="margin-top:24px;font-size:12px;color:#6b7f78">Viridia research output from stored end-of-day data. Not a recommendation.</p>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <>
      <button className={className || "btn pri sm"} onClick={show}><Icon name="sparkle" className="h-[14px] w-[14px]" /> Prepare my day</button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[rgba(9,45,34,0.3)] px-4 py-10" onClick={() => setOpen(false)}>
          <div
            ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
            className="w-full max-w-[640px] rounded-[var(--r-lg)] border border-line bg-panel text-fg outline-none" style={{ boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
              <h2 className="text-[16px] font-[650] tracking-[-0.015em]">{title}</h2>
              <span className="ml-auto flex gap-1.5">
                <button className="btn sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
                <button className="btn sm" onClick={print}>Print</button>
                <button className="btn ghost sm px-2" onClick={() => setOpen(false)} aria-label="Close"><Icon name="x" /></button>
              </span>
            </div>
            <div className="flex flex-col gap-4 px-5 py-4">
              {all.map((s) => (
                <section key={s.heading}>
                  <h3 className="label mb-1 uppercase tracking-[0.05em]">{s.heading}</h3>
                  {s.lines.length ? (
                    <ul className="flex list-disc flex-col gap-1 pl-4 text-[13.5px] leading-snug text-fg-2 marker:text-fg-3">
                      {s.lines.map((l, i) => <li key={i}>{l}</li>)}
                    </ul>
                  ) : <p className="text-[13px] text-fg-3">Nothing to report.</p>}
                </section>
              ))}
              <p className="text-[11.5px] text-fg-3">Compiled from stored end-of-day data. Research output, not a recommendation.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
