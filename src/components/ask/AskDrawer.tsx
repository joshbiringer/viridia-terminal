"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { ViridiaMark } from "@/components/ViridiaMark";
import { onContext, readContext } from "@/lib/ask/page-context";
import type { PageContext } from "@/lib/ask/types";
import { AskChat } from "./AskChat";
import { useAskSession } from "./useAskSession";

const RESERVED = new Set(["brief"]);

/** The page's own context: the security on /terminal/[symbol], plus whatever the page has published. */
function baseContext(path: string): PageContext {
  const m = path.match(/^\/terminal\/([^/?#]+)/);
  const symbol = m && !RESERVED.has(m[1]) ? decodeURIComponent(m[1]).toUpperCase() : null;
  return { path, symbol, scanner: path.startsWith("/scanner") ? path : null, watchlist: path.startsWith("/watchlist") };
}

export function contextLabel(c: PageContext): string | null {
  if (c.symbol && c.zone) return `${c.symbol} · zone ${c.zone.low.toFixed(2)}–${c.zone.high.toFixed(2)}`;
  if (c.symbol) return `${c.symbol}${c.degree ? ` · ${c.degree}` : ""}`;
  if (c.portfolioId) return "Open portfolio";
  return null;
}

/**
 * Ask Viridia from anywhere: a side panel (full screen on phones) that knows the page it was opened
 * from. "What would invalidate this?" on /terminal/NVDA means NVDA's current structure.
 */
export function AskDrawer() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const session = useAskSession();
  const { send, pending } = session;
  useEffect(() => onContext(() => setTick((t) => t + 1)), []);
  const ctx: PageContext = { ...baseContext(path), ...readContext(path) };
  void tick;
  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      const q = (e as CustomEvent<unknown>).detail;
      if (typeof q === "string" && q.trim() && !pending) void send(q, { audience: "professional", depth: "research", context: { ...baseContext(window.location.pathname), ...readContext(window.location.pathname) }, useContext: true });
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("viridia:ask-open", onOpen);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("viridia:ask-open", onOpen); window.removeEventListener("keydown", onKey); };
  }, [send, pending]);

  if (path.startsWith("/ask")) return null;
  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-40 inline-flex h-12 items-center gap-2.5 rounded-full bg-[var(--near-black)] pl-4 pr-5 text-white transition-transform hover:-translate-y-0.5" style={{ boxShadow: "var(--shadow-lg)" }} aria-label="Ask Viridia">
          <ViridiaMark size={18} className="text-emerald" /><span className="font-mono text-[11px] uppercase tracking-[0.16em]">Ask Viridia</span>
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/25 sm:bg-black/15" onClick={() => setOpen(false)}>
          <aside className="flex h-full w-full flex-col bg-panel sm:w-[520px] sm:border-l sm:border-line" style={{ boxShadow: "var(--shadow-lg)" }} onClick={(e) => e.stopPropagation()} aria-label="Ask Viridia" role="dialog" aria-modal="true">
            <div className="dark-band flex items-center gap-2.5 px-4 py-3">
              <ViridiaMark size={18} className="text-emerald" />
              <span className="font-mono text-[11px] uppercase tracking-[0.16em]">Ask Viridia</span>
              <Link href="/ask" className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-white/70 hover:text-white" onClick={() => setOpen(false)}>Full view</Link>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-white/80 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Close"><Icon name="x" /></button>
            </div>
            <div className="min-h-0 flex-1"><AskChat session={session} context={ctx} contextLabel={contextLabel(ctx)} compact /></div>
          </aside>
        </div>
      )}
    </>
  );
}
