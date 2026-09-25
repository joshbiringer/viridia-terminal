"use client";

import { useEffect, useState } from "react";
import { ViridiaMark } from "./ViridiaMark";
import { Icon } from "./Icon";

const SUGGESTED = [
  "Why is this Wave 3?",
  "What invalidates this count?",
  "Explain the Fibonacci targets.",
  "Show the alternate count.",
  "Compare the weekly and daily structures.",
  "What changed since yesterday?",
];

/**
 * Ask Viridia explains results the numerical engine has calculated. It never produces a wave count itself,
 * so until the engine has a result for this security it says so instead of answering.
 */
export function AskViridiaButton({ symbol }: { symbol: string }) {
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button className="btn pri" onClick={() => setOpen(true)}>
        <ViridiaMark size={15} /> Ask Viridia
      </button>
      {open && <div className="fixed inset-0 z-50 bg-[rgba(9,45,34,0.14)]" onClick={() => setOpen(false)} />}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-line bg-panel transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{ boxShadow: open ? "var(--shadow-lg)" : undefined }}
        aria-hidden={!open} aria-label="Ask Viridia"
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <ViridiaMark size={20} className="text-brand" />
          <div className="flex-1">
            <div className="text-[15px] font-semibold tracking-[-0.015em]">Ask Viridia</div>
            <div className="text-[12.5px] text-fg-3">About {symbol}</div>
          </div>
          <button className="btn ghost sm px-2" onClick={() => setOpen(false)} aria-label="Close">
            <Icon d="M6 6l12 12M18 6L6 18" />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          <p className="text-[13.5px] leading-relaxed text-fg-2">
            Ask Viridia explains the analysis the engine calculates: why a wave is labeled the way it is, what would invalidate it,
            and where Fibonacci relationships cluster. It does not create wave counts on its own.
          </p>
          <div className="flex flex-col gap-2">
            <div className="label">Suggested questions</div>
            {SUGGESTED.map((q) => (
              <button
                key={q} onClick={() => setAsked(q)}
                className={`rounded-[10px] border px-4 py-2.5 text-left text-[13.5px] transition-colors ${asked === q ? "border-brand bg-panel-2" : "border-line hover:border-line-2 hover:bg-hover"}`}
              >
                {q}
              </button>
            ))}
          </div>
          {asked && (
            <div className="rounded-[12px] bg-panel-2 px-4 py-4 text-[13.5px] leading-relaxed">
              <div className="mb-1.5 font-medium">{asked}</div>
              <p className="text-fg-2">
                There&apos;s no calculated wave count for {symbol} yet, so there&apos;s nothing to explain. The wave engine is being built
                in Phases 5–7 (swing pivots and rule validation are live); once it produces a preferred count, this answer will walk through the rules it satisfied, its
                invalidation level and the Fibonacci evidence, citing the engine&apos;s own output.
              </p>
            </div>
          )}
        </div>
        <div className="border-t border-line px-5 py-4">
          <input className="field w-full" placeholder="Questions open when the wave engine is live" disabled aria-label="Ask a question" />
        </div>
      </aside>
    </>
  );
}
