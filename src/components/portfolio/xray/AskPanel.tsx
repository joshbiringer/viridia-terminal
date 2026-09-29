"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { PORTFOLIO_QUESTIONS, answer, type Answer } from "@/lib/portfolio/ask";
import type { Change } from "@/lib/portfolio/snapshot";
import type { Workspace } from "@/lib/portfolio/workspace";

/** Ask Viridia About This Portfolio: answers are assembled from this X-Ray's figures only. */
export function AskPanel({ ws, changes, since, go }: { ws: Workspace; changes: Change[] | null; since: string | null; go: (tab: string) => void }) {
  const [q, setQ] = useState("");
  const [log, setLog] = useState<Answer[]>([]);
  const ask = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setLog((l) => [answer(t, ws, changes, since), ...l].slice(0, 6));
    setQ("");
  };
  return (
    <section className="card flex flex-col" aria-labelledby="ask-t">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <Icon name="sparkle" className="h-[14px] w-[14px] text-brand" />
        <h2 id="ask-t" className="card-t text-[14px]">Ask Viridia about this portfolio</h2>
      </div>
      <form className="flex gap-2 border-b border-line px-4 py-2.5" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input className="field h-8 min-w-0 flex-1 text-[13px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about risk, exposure or a ticker" aria-label="Question" />
        <button className="btn sm" type="submit" disabled={!q.trim()}>Ask</button>
      </form>
      <div className="flex flex-col gap-0.5 border-b border-line px-2 py-2">
        {PORTFOLIO_QUESTIONS.map((s) => (
          <button key={s} className="rounded-[var(--r-sm)] px-2 py-1 text-left text-[12.5px] text-fg-2 transition-colors hover:bg-hover hover:text-fg" onClick={() => ask(s)}>{s}</button>
        ))}
      </div>
      <div className="flex max-h-[520px] flex-col divide-y divide-line overflow-y-auto" aria-live="polite">
        {log.map((a, i) => (
          <article key={log.length - i} className="px-4 py-3">
            <h3 className="text-[12.5px] font-[600] text-fg">{a.question}</h3>
            <ul className="mt-1 flex flex-col gap-1 text-[12.5px] leading-snug text-fg-2">{a.lines.map((l, j) => <li key={j}>{l}</li>)}</ul>
            {a.tab && <button className="mt-1.5 text-[12px] text-brand hover:underline" onClick={() => go(a.tab!)}>Open {a.tab} →</button>}
          </article>
        ))}
        {!log.length && <p className="px-4 py-3 text-[12px] leading-relaxed text-fg-3">Answers use only this X-Ray&apos;s calculated figures. Viridia won&apos;t invent data, wave counts, correlations or tax values.</p>}
      </div>
    </section>
  );
}
