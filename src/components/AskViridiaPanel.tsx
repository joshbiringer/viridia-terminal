"use client";

import { useEffect, useRef, useState } from "react";
import { ViridiaMark } from "./ViridiaMark";
import { Icon } from "./Icon";
import { useDegree } from "./analysis/DegreeContext";
import { DEGREE_LABEL } from "@/lib/analysis/pivots";
import { QUESTIONS, answer, answerText, clientAnswer, route, type Answer, type Audience, type Block, type ExplainContext, type QuestionId } from "@/lib/analysis/explain";

type Props = Omit<ExplainContext, "degree">;

/**
 * Ask Viridia explains results the numerical engine has calculated for this security. Every answer is
 * assembled from the engine's own output and the source material; it never produces a wave count or
 * a forecast of its own, and says so when the engine has nothing to explain.
 */
export function AskViridiaButton(props: Props) {
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState<{ id: QuestionId | null; text: string } | null>(null);
  const [draft, setDraft] = useState("");
  const { degree } = useDegree(props.glances?.auto?.degree ?? "intermediate");
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    // the command bar can pass a typed question along with the event
    const onOpen = (e: Event) => {
      setOpen(true);
      const text = (e as CustomEvent<unknown>).detail;
      if (typeof text === "string" && text.trim()) {
        const id = route(text);
        setAsked({ id: id && QUESTIONS.some((q) => q.id === id) ? id : null, text });
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("viridia:ask", onOpen);
    // arriving from Mission Control's "Ask Viridia" opens the panel straight away
    if (new URLSearchParams(window.location.search).get("ask") === "1") queueMicrotask(() => setOpen(true));
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("viridia:ask", onOpen); };
  }, []);

  // weekly and history answers need their data; hide those questions until it is loaded
  const available = QUESTIONS.filter((q) => (q.id === "weekly" ? props.weekly !== undefined : q.id === "changed" ? props.history !== undefined : true));
  const [audience, setAudience] = useState<Audience>("advisor");
  const [copied, setCopied] = useState(false);
  const result: Answer | null = asked?.id ? (audience === "client" ? clientAnswer : answer)(asked.id, { ...props, degree }) : null;
  const copy = async () => {
    if (!result) return;
    try { await navigator.clipboard.writeText(answerText(result)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  const ask = (id: QuestionId | null, text: string) => {
    setAsked({ id, text });
    requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const id = route(text);
    ask(id && available.some((q) => q.id === id) ? id : null, text);
    setDraft("");
  };

  return (
    <>
      <button className="btn pri" onClick={() => setOpen(true)}>
        <ViridiaMark size={15} /> Ask Viridia
      </button>
      {open && <div className="fixed inset-0 z-50 bg-[rgba(9,45,34,0.14)]" onClick={() => setOpen(false)} />}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col border-l border-line bg-panel transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{ boxShadow: open ? "var(--shadow-lg)" : undefined }}
        aria-hidden={!open} aria-label="Ask Viridia" inert={!open}
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <ViridiaMark size={20} className="text-brand" />
          <div className="flex-1">
            <div className="text-[15px] font-semibold tracking-[-0.015em]">Ask Viridia</div>
            <div className="text-[12.5px] text-fg-3">About {props.symbol} · {DEGREE_LABEL[degree]} degree, daily</div>
          </div>
          <button className="btn ghost sm px-2" onClick={() => setOpen(false)} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>

        <div ref={bodyRef} className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          {asked && (
            <article className="rounded-[var(--r-lg)] border border-line bg-panel-2 px-4 py-4 text-[13.5px] leading-relaxed" aria-live="polite">
              <div className="mb-2 text-[12px] text-fg-3">{asked.text}</div>
              <div className="mb-3 flex items-center gap-2">
                <div className="seg" role="tablist" aria-label="Audience">
                  <button role="tab" aria-selected={audience === "advisor"} onClick={() => setAudience("advisor")}>Advisor</button>
                  <button role="tab" aria-selected={audience === "client"} onClick={() => setAudience("client")}>Explain to client</button>
                </div>
                {result && <button className="btn ghost sm ml-auto" onClick={copy}>{copied ? "Copied" : "Copy"}</button>}
              </div>
              {result ? <AnswerView a={result} /> : (
                <>
                  <h3 className="mb-1.5 font-semibold">That one isn&apos;t something the engine can answer</h3>
                  <p className="text-fg-2">
                    Ask Viridia answers from the wave engine&apos;s own results for {props.symbol}, so it covers the questions below. It doesn&apos;t
                    forecast prices or discuss anything outside the analysis.
                  </p>
                </>
              )}
            </article>
          )}
          {!asked && (
            <p className="text-[13.5px] leading-relaxed text-fg-2">
              Answers come from the engine&apos;s results for {props.symbol} (the ranked counts, their rule checks, levels, Fibonacci
              targets and setups) and from the Elliott Wave sources behind the rulebook. Viridia never makes up a count.
            </p>
          )}
          <div className="flex flex-col gap-2">
            <div className="label">{asked ? "Ask another" : "Questions"}</div>
            {available.map((q) => (
              <button
                key={q.id} onClick={() => ask(q.id, q.q)}
                className={`rounded-[var(--r-lg)] border px-4 py-2.5 text-left text-[13.5px] transition-colors ${asked?.id === q.id ? "border-brand bg-panel-2" : "border-line hover:border-line-2 hover:bg-hover"}`}
              >
                {q.q}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={submit} className="flex gap-2 border-t border-line px-5 py-4">
          <input
            className="field w-full" value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder={`Ask about ${props.symbol}'s wave count`} aria-label="Ask a question"
          />
          <button type="submit" className="btn" disabled={!draft.trim()}>Ask</button>
        </form>
      </aside>
    </>
  );
}

function AnswerView({ a }: { a: Answer }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="font-semibold tracking-[-0.01em]">{a.title}</h3>
      {a.blocks.map((b, i) => <BlockView key={i} b={b} />)}
      {a.sources.length > 0 && <p className="mt-1 text-[12px] text-fg-3">Sources: {a.sources.join(" · ")}</p>}
    </div>
  );
}

function BlockView({ b }: { b: Block }) {
  if (b.kind === "p") return <p className="text-fg-2">{b.text}</p>;
  if (b.kind === "list") {
    return (
      <ul className="flex flex-col gap-1">
        {b.items.map((x, i) => (
          <li key={i} className="flex gap-2 text-fg-2">
            <span aria-hidden className={x.tone === "pos" ? "text-pos" : x.tone === "neg" ? "text-neg" : "text-fg-3"}>{x.tone === "pos" ? "✓" : x.tone === "neg" ? "✗" : "·"}</span>
            <span>{x.text}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <dl className="flex flex-col gap-2 rounded-[var(--r-md)] bg-panel px-3 py-2.5">
      {b.rows.map((r, i) => (
        <div key={i}>
          <div className="flex items-baseline gap-3">
            <dt className="text-[12.5px] text-fg-3">{r.name}</dt>
            <dd className="num ml-auto font-semibold" style={r.tone ? { color: `var(--${r.tone})` } : undefined}>{r.value}</dd>
          </div>
          <p className="text-[12px] leading-snug text-fg-3">{r.note}</p>
        </div>
      ))}
    </dl>
  );
}
