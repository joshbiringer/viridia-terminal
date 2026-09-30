"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { ViridiaMark } from "@/components/ViridiaMark";
import { useViewer } from "@/components/ViewerProvider";
import { addToWatchlist } from "@/lib/watchlist";
import { AUDIENCE_LABEL, DEPTH_LABEL, type Answer, type Audience, type Depth, type PageContext } from "@/lib/ask/types";
import { Actions, BlockView, CitationList, EvidenceBadge } from "./AskBlocks";
import type { useAskSession } from "./useAskSession";

type Session = ReturnType<typeof useAskSession>;

const SLASH = [
  ["/research", "NVDA", "Research a company"], ["/compare", "NVDA AMD", "Compare securities"], ["/screen", "wave 3 stocks near a Fib zone", "Screen in plain language"],
  ["/structure", "QCOM", "Viridia structure"], ["/portfolio", "", "Your saved portfolio"], ["/explain", "duration", "Explain a concept"],
] as const;

export const HOME: { title: string; q: string }[] = [
  { title: "Research a company", q: "Research NVDA" },
  { title: "Understand markets", q: "Why are Treasury yields rising?" },
  { title: "Use Viridia Intelligence", q: "Find stocks near Fibonacci confluence" },
  { title: "Compare", q: "Compare AMD and NVDA" },
  { title: "Learn", q: "Explain free cash flow yield" },
  { title: "Portfolio", q: "Analyze my portfolio" },
];

export function AskChat({ session, context, contextLabel, compact = false, onCite, activeCite }: {
  session: Session; context: PageContext; contextLabel: string | null; compact?: boolean;
  onCite?: (answer: Answer, id: number) => void; activeCite?: { answer: Answer; id: number } | null;
}) {
  const { viewer } = useViewer();
  const [q, setQ] = useState("");
  const [audience, setAudience] = useState<Audience>("professional");
  const [depth, setDepth] = useState<Depth>("research");
  const [useCtx, setUseCtx] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { turns, pending, error, send } = session;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns.length, pending?.blocks.length]);

  const ask = (text: string, aud = audience) => {
    if (!text.trim() || pending) return;
    setQ(""); setNote(null);
    void send(text, { audience: aud, depth, context, useContext: useCtx });
  };
  const watch = async (symbols: string[]) => {
    if (!viewer) { setNote("Sign in to keep a watchlist."); return; }
    try {
      for (const s of symbols) {
        const r = await fetch(`/api/preview/${encodeURIComponent(s)}`);
        const j = await r.json();
        if (j?.id) await addToWatchlist(viewer.id, j.id, s);
      }
      setNote(`Added ${symbols.join(", ")} to your watchlist.`);
    } catch { setNote("The watchlist couldn't be updated. Try again."); }
  };
  const slashOpen = q.startsWith("/") && !q.includes(" ");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`min-h-0 flex-1 overflow-y-auto ${compact ? "px-4" : "px-6 lg:px-10"}`}>
        {!turns.length && !pending ? (
          <div className={`mx-auto flex max-w-[760px] flex-col ${compact ? "py-6" : "py-14"}`}>
            <p className="f-eyebrow text-brand">Ask Viridia</p>
            <h1 className={`${compact ? "text-[28px]" : "f-heading"} gradient-text mt-3`}>Your AI financial research copilot.</h1>
            <p className="mt-3 max-w-[600px] text-[15px] font-[300] leading-relaxed text-fg-2">Ask about markets, companies, portfolios, financial concepts, or Viridia&apos;s analysis. Answers are built from Viridia&apos;s data first, with sources, and say plainly when data isn&apos;t available.</p>
            <div className={`mt-8 grid gap-2 ${compact ? "" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
              {HOME.map((h) => (
                <button key={h.title} onClick={() => ask(h.q)} className="group rounded-[12px] border border-line bg-panel px-4 py-3 text-left transition-colors hover:border-brand">
                  <p className="f-label text-fg-3">{h.title}</p>
                  <p className="mt-1 flex items-center gap-2 text-[14.5px]"><span className="flex-1">&ldquo;{h.q}&rdquo;</span><span className="f-arrow h-6 w-6">→</span></p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[860px] flex-col gap-8 py-6">
            {turns.map((t, i) => t.role === "user"
              ? <Question key={i} q={t.q} audience={t.audience} />
              : <AnswerView key={i} a={t.answer} compact={compact} onAsk={ask} onWatch={watch} onCite={onCite} activeCite={activeCite}
                  onClient={() => { const qn = [...turns.slice(0, i)].reverse().find((x) => x.role === "user"); if (qn && qn.role === "user") ask(qn.q, "client"); }} />)}
            {pending && (
              <div className="flex flex-col gap-4">
                {pending.status && <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-3"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />{pending.status}</p>}
                {pending.blocks.map((b, j) => <BlockView key={j} b={b} />)}
                {pending.text && <p className="rounded-[10px] border border-dashed border-line-2 px-4 py-3 text-[14.5px] leading-relaxed">{pending.text}</p>}
              </div>
            )}
            {error && <p className="text-[13px] text-neg" role="alert">{error}</p>}
            {note && <p className="text-[13px] text-fg-2" role="status">{note}</p>}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form className={`border-t border-line bg-panel ${compact ? "px-3 py-3" : "px-6 py-4 lg:px-10"}`} onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <div className="relative mx-auto max-w-[860px]">
          {slashOpen && (
            <ul className="absolute bottom-full left-0 z-10 mb-2 w-[340px] rounded-[12px] border border-line bg-panel p-1.5" style={{ boxShadow: "var(--shadow-lg)" }}>
              {SLASH.filter(([c]) => c.startsWith(q.toLowerCase())).map(([c, ex, hint]) => (
                <li key={c}><button type="button" className="menu-item" onClick={() => { setQ(`${c} ${ex}`.trimEnd() + (ex ? "" : " ")); inputRef.current?.focus(); }}>
                  <span className="font-mono text-[12px] text-brand">{c}</span><span className="text-fg-3">{hint}</span>
                </button></li>
              ))}
            </ul>
          )}
          <div className="rounded-[14px] border border-line-2 bg-bg px-3 pb-2 pt-2.5 focus-within:border-brand">
            <textarea ref={inputRef} rows={compact ? 2 : 2} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ask Viridia"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q); } }}
              placeholder="Ask Viridia anything about markets, companies, portfolios, or finance…" className="w-full resize-none bg-transparent text-[15px] outline-none placeholder:text-fg-3" />
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {contextLabel && (
                <button type="button" onClick={() => setUseCtx((v) => !v)} aria-pressed={useCtx} title="Use what this page is showing as context"
                  className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] ${useCtx ? "border-brand bg-[var(--accent-bg)] text-brand" : "border-line text-fg-3 line-through"}`}>
                  <Icon name="target" className="h-[12px] w-[12px]" />{contextLabel}
                </button>
              )}
              <label className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-fg-3">Explain as
                <select value={audience} onChange={(e) => setAudience(e.target.value as Audience)} className="rounded-[6px] border border-line bg-panel px-1.5 py-1 font-mono text-[10.5px] uppercase text-fg">
                  {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
                </select>
              </label>
              {!compact && (
                <div className="seg" role="radiogroup" aria-label="Research mode">
                  {(Object.keys(DEPTH_LABEL) as Depth[]).map((d) => <button type="button" key={d} role="radio" aria-checked={depth === d} onClick={() => setDepth(d)}>{DEPTH_LABEL[d]}</button>)}
                </div>
              )}
              <button className="btn pri sm ml-auto" type="submit" disabled={!q.trim() || !!pending}>Ask</button>
            </div>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-fg-3">Type / for commands. Research output from Viridia&apos;s data; not investment advice.</p>
        </div>
      </form>
    </div>
  );
}

function Question({ q, audience }: { q: string; audience: Audience }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-hover font-mono text-[10px] text-fg-2">YOU</span>
      <div>
        <p className="text-[17px] font-[500] leading-snug">{q}</p>
        {audience !== "professional" && <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-fg-3">Explained as {AUDIENCE_LABEL[audience]}</p>}
      </div>
    </div>
  );
}

function AnswerView({ a, compact, onAsk, onWatch, onCite, activeCite, onClient }: {
  a: Answer; compact: boolean; onAsk: (q: string) => void; onWatch: (s: string[]) => void; onClient: () => void;
  onCite?: (a: Answer, id: number) => void; activeCite?: { answer: Answer; id: number } | null;
}) {
  const [showSources, setShowSources] = useState(false);
  const actions = a.blocks.find((b) => b.type === "actions");
  const cite = (id: number) => { if (onCite && !compact) onCite(a, id); else { setShowSources(true); requestAnimationFrame(() => document.getElementById(`cite-${id}`)?.scrollIntoView({ block: "nearest" })); } };
  return (
    <article className="flex gap-3">
      <span className="mt-1 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[var(--near-black)]"><ViridiaMark size={15} className="text-emerald" /></span>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[13px] font-[600] text-fg-2">{a.title}</h2>
          <EvidenceBadge ev={a.evidence} />
          {a.intent !== "WATCHLIST_ACTION" && <button className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-brand hover:underline" onClick={onClient}>Explain to client</button>}
        </div>
        {a.blocks.filter((b) => b.type !== "actions").map((b, i) => <BlockView key={i} b={b} onCite={cite} onAsk={onAsk} />)}
        {actions && actions.type === "actions" && <Actions items={actions.items} onAsk={onAsk} onWatch={onWatch} />}
        {a.followups.length > 0 && (
          <div>
            <p className="f-label mb-2 text-fg-3">Ask next</p>
            <div className="flex flex-wrap gap-2">{a.followups.map((f) => <button key={f} onClick={() => onAsk(f)} className="rounded-full border border-line px-3 py-1 text-[13px] text-fg-2 transition-colors hover:border-brand hover:text-brand">{f}</button>)}</div>
          </div>
        )}
        {a.citations.length > 0 && (compact || !onCite) && (
          <div>
            <button className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-3 hover:text-fg" onClick={() => setShowSources((v) => !v)}>{showSources ? "Hide" : "Show"} sources ({a.citations.length})</button>
            {showSources && <div className="mt-2"><CitationList citations={a.citations} active={activeCite?.answer === a ? activeCite.id : null} /></div>}
          </div>
        )}
        {!compact && onCite && a.citations.length > 0 && <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-3">{a.citations.length} source{a.citations.length === 1 ? "" : "s"} · shown in the panel</p>}
      </div>
    </article>
  );
}

export const askLink = (q: string) => `/ask?q=${encodeURIComponent(q)}`;
