"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useViewer } from "@/components/ViewerProvider";
import { deleteConversation, listConversations, updateConversation, type Conversation } from "@/lib/ask/conversations";
import type { Answer } from "@/lib/ask/types";
import { AskChat } from "./AskChat";
import { CitationList } from "./AskBlocks";
import { useAskSession } from "./useAskSession";

/**
 * The full Ask Viridia workspace: saved conversations grouped by research workspace on the left,
 * the conversation in the middle, and the selected answer's sources and research context on the right.
 */
export function AskWorkspace({ initialQ }: { initialQ: string | null }) {
  const { viewer } = useViewer();
  const [list, setList] = useState<Conversation[]>([]);
  const [archived, setArchived] = useState(false);
  const [cite, setCite] = useState<{ answer: Answer; id: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const wsEntities = useCallback((ws: string | null) => (ws ? [...new Set(list.filter((c) => c.workspace === ws).flatMap((c) => c.entities))] : []), [list]);
  const onSaved = useCallback((c: Conversation) => setList((l) => [c, ...l.filter((x) => x.id !== c.id)]), []);
  const session = useAskSession({ workspaceEntities: wsEntities, onSaved });
  const { conv, setConv, turns, send } = session;

  useEffect(() => {
    if (!viewer) return;
    listConversations().then(setList).catch(() => {});
  }, [viewer]);
  // ?q= from the command bar starts a conversation straight away
  const started = useRef(false);
  useEffect(() => {
    if (initialQ && !started.current) { started.current = true; void send(initialQ, { audience: "professional", depth: "research", context: {}, useContext: false }); }
  }, [initialQ, send]);

  const answers = turns.filter((t) => t.role === "assistant").map((t) => (t as { answer: Answer }).answer);
  const shown = cite?.answer ?? answers.at(-1) ?? null;
  const groups = useMemo(() => {
    const g = new Map<string, Conversation[]>();
    for (const c of list.filter((x) => x.archived === archived)) {
      const k = c.workspace ?? "";
      g.set(k, [...(g.get(k) ?? []), c]);
    }
    return [...g].sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : a[0].localeCompare(b[0])));
  }, [list, archived]);

  const patch = async (c: Conversation, p: Partial<Pick<Conversation, "title" | "workspace" | "archived">>) => {
    try {
      const u = await updateConversation(c.id, p);
      setList((l) => l.map((x) => (x.id === u.id ? u : x)));
      if (conv?.id === u.id) setConv({ ...u, messages: turns });
    } catch { /* keep the list as is */ }
  };
  const remove = async (c: Conversation) => {
    if (!window.confirm(`Delete "${c.title}"?`)) return;
    try { await deleteConversation(c.id); setList((l) => l.filter((x) => x.id !== c.id)); if (conv?.id === c.id) setConv(null); } catch { /* ignore */ }
  };

  return (
    <div className="card grid h-[calc(100vh-140px)] min-h-[560px] overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_320px]">
      <aside className="hidden min-h-0 flex-col border-r border-line lg:flex" aria-label="Conversations">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="card-t">Research</span>
          <button className="btn sm ml-auto" onClick={() => { setConv(null); setCite(null); }}>New</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {!viewer && <p className="px-2 py-3 text-[12.5px] text-fg-3"><Link href="/signin?next=/ask" className="text-brand hover:underline">Sign in</Link> to save conversations and group them into research workspaces.</p>}
          {viewer && !list.length && <p className="px-2 py-3 text-[12.5px] text-fg-3">Conversations you have are saved here.</p>}
          {groups.map(([ws, cs]) => (
            <div key={ws || "none"} className="mb-3">
              <p className="f-label px-2 pb-1 text-fg-3">{ws || "Conversations"}</p>
              <ul>
                {cs.map((c) => (
                  <li key={c.id} className={`group rounded-[8px] ${conv?.id === c.id ? "bg-hover" : "hover:bg-hover/60"}`}>
                    {editing === c.id ? (
                      <input autoFocus defaultValue={c.title} className="field h-8 w-full text-[13px]" onBlur={(e) => { setEditing(null); if (e.target.value.trim() && e.target.value !== c.title) void patch(c, { title: e.target.value }); }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(null); }} />
                    ) : (
                      <button className="w-full truncate px-2 py-1.5 text-left text-[13px]" onClick={() => { setConv(c); setCite(null); }} title={c.title}>{c.title}</button>
                    )}
                    <div className="hidden gap-2 px-2 pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-fg-3 group-hover:flex">
                      <button className="hover:text-brand" onClick={() => setEditing(c.id)}>Rename</button>
                      <button className="hover:text-brand" onClick={() => { const w = window.prompt("Add to research workspace (name, or empty to remove):", c.workspace ?? ""); if (w !== null) void patch(c, { workspace: w.trim() || null }); }}>Workspace</button>
                      <button className="hover:text-brand" onClick={() => void patch(c, { archived: !c.archived })}>{c.archived ? "Restore" : "Archive"}</button>
                      <button className="hover:text-neg" onClick={() => void remove(c)}>Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {viewer && <button className="border-t border-line px-4 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-fg-3 hover:text-fg" onClick={() => setArchived((v) => !v)}>{archived ? "Back to conversations" : "Show archived"}</button>}
      </aside>

      <section className="min-h-0 min-w-0">
        <AskChat session={session} context={{}} contextLabel={conv?.workspace ? `Workspace: ${conv.workspace}` : null} onCite={(answer, id) => setCite({ answer, id })} activeCite={cite} />
      </section>

      <aside className="hidden min-h-0 flex-col overflow-y-auto border-l border-line xl:flex" aria-label="Sources and research context">
        <div className="border-b border-line px-4 py-3"><span className="card-t">Sources</span></div>
        <div className="px-4 py-3">
          {shown?.citations.length ? <CitationList citations={shown.citations} active={cite?.answer === shown ? cite.id : null} onCite={(id) => shown && setCite({ answer: shown, id })} /> : <p className="text-[12.5px] text-fg-3">Sources for each answer appear here.</p>}
        </div>
        <div className="border-y border-line px-4 py-3"><span className="card-t">Research context</span></div>
        <div className="flex flex-col gap-3 px-4 py-3 text-[12.5px]">
          {conv?.workspace && <p><span className="f-label text-fg-3">Workspace</span><br />{conv.workspace}</p>}
          <div>
            <p className="f-label mb-1.5 text-fg-3">Securities in this conversation</p>
            {session.entities.length ? <div className="flex flex-wrap gap-1.5">{session.entities.map((s) => <Link key={s} href={`/terminal/${s}`} className="rounded-full border border-line px-2.5 py-0.5 font-[600] hover:border-brand hover:text-brand">{s}</Link>)}</div> : <p className="text-fg-3">None yet.</p>}
          </div>
          {conv?.workspace && wsEntities(conv.workspace).length > 0 && <p className="text-fg-3">Viridia also remembers {wsEntities(conv.workspace).join(", ")} from this workspace. Other conversations aren&apos;t used as context.</p>}
          {shown && <p className="text-fg-3">Data as of {shown.trace.dataAsOf ?? "—"}.</p>}
        </div>
      </aside>
    </div>
  );
}
