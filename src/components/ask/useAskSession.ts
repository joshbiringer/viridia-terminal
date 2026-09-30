"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useViewer } from "@/components/ViewerProvider";
import { createConversation, updateConversation, type Conversation, type Turn } from "@/lib/ask/conversations";
import type { Answer, AskEvent, Audience, Block, Depth, Intent, PageContext } from "@/lib/ask/types";

export interface Pending { q: string; status: string | null; blocks: Block[]; intent: Intent | null; text: string }

/**
 * One Ask Viridia conversation: sends questions to /api/ask, renders streamed blocks as they arrive,
 * and saves the conversation for signed-in readers. Memory is scoped: only this conversation's
 * securities and, when it belongs to a workspace, that workspace's securities are sent as context.
 */
export function useAskSession(opts: { workspaceEntities?: (ws: string | null) => string[]; onSaved?: (c: Conversation) => void } = {}) {
  const { viewer } = useViewer();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const convRef = useRef<Conversation | null>(null);
  convRef.current = conv;

  const answers = useMemo(() => turns.filter((t): t is Extract<Turn, { role: "assistant" }> => t.role === "assistant").map((t) => t.answer), [turns]);
  const last = useMemo(() => answers.at(-1)?.symbols ?? [], [answers]);
  const entities = useMemo(() => [...new Set([...(conv?.entities ?? []), ...answers.flatMap((a) => a.symbols)])], [conv, answers]);

  const load = useCallback((c: Conversation | null) => {
    abort.current?.abort();
    setConv(c); setTurns(c?.messages ?? []); setPending(null); setError(null);
  }, []);

  const send = useCallback(async (q: string, o: { audience: Audience; depth: Depth; context: PageContext; useContext: boolean }) => {
    const question = q.trim();
    if (!question) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const userTurn: Turn = { role: "user", q: question, audience: o.audience, depth: o.depth, at: new Date().toISOString() };
    setTurns((t) => [...t, userTurn]);
    setPending({ q: question, status: "Thinking…", blocks: [], intent: null, text: "" });
    setError(null);
    const wsEntities = opts.workspaceEntities?.(convRef.current?.workspace ?? null) ?? [];
    let answer: Answer | null = null;
    try {
      const res = await fetch("/api/ask", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ q: question, audience: o.audience, depth: o.depth, context: o.context, useContext: o.useContext, last, entities: [...new Set([...entities, ...wsEntities])] }),
      });
      if (!res.ok || !res.body) throw new Error("request failed");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) {
          if (!l.trim()) continue;
          const e = JSON.parse(l) as AskEvent;
          if (e.type === "status") setPending((p) => (p ? { ...p, status: e.text } : p));
          else if (e.type === "intent") setPending((p) => (p ? { ...p, intent: e.intent } : p));
          else if (e.type === "block") setPending((p) => (p ? { ...p, blocks: [...p.blocks, e.block] } : p));
          else if (e.type === "text") setPending((p) => (p ? { ...p, text: p.text + e.delta } : p));
          else if (e.type === "done") answer = e.answer;
          else if (e.type === "error") setError(e.text);
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Ask Viridia couldn't reach the server. Check your connection and try again.");
    }
    setPending(null);
    if (!answer) return;
    const a: Answer = answer;
    const aTurn: Turn = { role: "assistant", answer: a, at: new Date().toISOString() };
    setTurns((t) => {
      const next = [...t, aTurn];
      // save for signed-in readers (fire and forget; the conversation stays usable if saving fails)
      if (viewer) {
        const ents = [...new Set([...(convRef.current?.entities ?? []), ...a.symbols])];
        const c = convRef.current;
        (c ? updateConversation(c.id, { messages: next, entities: ents }) : createConversation({ title: titleOf(question, a), messages: next, entities: ents }))
          .then((saved) => { setConv(saved); opts.onSaved?.(saved); })
          .catch(() => setError("This conversation couldn't be saved; it's still here until you leave."));
      }
      return next;
    });
  }, [viewer, last, entities, opts]);

  return { conv, setConv: load, turns, pending, error, send, last, entities, stop: () => abort.current?.abort() };
}

function titleOf(q: string, a: Answer): string {
  if (a.symbols.length && a.intent !== "FINANCIAL_EDUCATION") return `${a.symbols.slice(0, 3).join(", ")} · ${q}`.slice(0, 80);
  return q.slice(0, 80);
}
