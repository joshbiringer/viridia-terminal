"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchHit } from "@/lib/types";
import { exchangeLabel, stockHref, subtypeLabel } from "@/lib/format";
import { Icon } from "./Icon";

type Item = { key: string; href: string; hit?: SearchHit; label?: string };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const show = useCallback(() => { setOpen(true); setQ(""); setHits([]); setSel(0); setError(null); }, []);
  const hide = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (open) hide(); else show(); }
      else if (e.key === "/" && !typing && !open) { e.preventDefault(); show(); }
      else if (e.key === "Escape") hide();
    };
    const onOpen = () => show();
    window.addEventListener("keydown", onKey);
    window.addEventListener("viridia:open-palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("viridia:open-palette", onOpen); };
  }, [open, show, hide]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 10); }, [open]);

  // Debounced, cancellable search against the security master
  useEffect(() => {
    const term = q.trim();
    if (!term) { setHits([]); setLoading(false); return; }
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/securities/search?q=${encodeURIComponent(term)}&limit=10`, { signal: ctl.signal });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Search failed (${res.status})`);
        const data = (await res.json()) as { results: SearchHit[] };
        setHits(data.results); setSel(0); setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, 120);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  const items: Item[] = [
    ...hits.map((h) => ({ key: `s${h.id}`, href: stockHref(h.symbol), hit: h })),
    ...(q.trim() ? [{ key: "browse", href: `/markets/stocks?q=${encodeURIComponent(q.trim())}`, label: `See all matches for “${q.trim()}”` }] : []),
  ];

  const go = (i: number) => { const it = items[i]; if (!it) return; hide(); router.push(it.href); };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-[rgba(9,45,34,0.18)] px-4 pt-[12vh] backdrop-blur-[1px]"
      role="dialog" aria-modal="true" aria-label="Search securities"
      onMouseDown={(e) => { if (e.target === e.currentTarget) hide(); }}
    >
      <div className="w-full max-w-[640px] overflow-hidden rounded-[14px] border border-line bg-panel" style={{ boxShadow: "var(--shadow-lg)" }}>
        <div className="flex items-center gap-3 border-b border-line px-4 text-fg-3">
          <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); go(sel); }
            }}
            placeholder="Search ticker or company…"
            className="palette-input h-[56px] min-w-0 flex-1 bg-transparent text-[16px] tracking-[-0.01em] text-fg"
            autoComplete="off" spellCheck={false}
            aria-controls="palette-results"
          />
          {loading && <span className="text-[11.5px]">Searching…</span>}
        </div>
        <div ref={listRef} id="palette-results" className="max-h-[380px] overflow-y-auto p-1.5" role="listbox">
          {error && <div className="px-3 py-4 text-[12.5px] text-neg">{error}</div>}
          {!q.trim() && (
            <div className="px-3 py-5 text-[13px] text-fg-3">
              Search thousands of securities: every active NYSE, NASDAQ, NYSE American, NYSE Arca and Cboe listing.
            </div>
          )}
          {q.trim() && !loading && !error && hits.length === 0 && (
            <div className="px-3 py-5 text-[12.5px] text-fg-2">No listed security matches “{q.trim()}”.</div>
          )}
          {items.map((it, i) => (
            <div
              key={it.key} data-i={i} role="option" aria-selected={i === sel}
              onMouseEnter={() => setSel(i)} onClick={() => go(i)}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 ${i === sel ? "bg-panel-2" : ""}`}
            >
              {it.hit ? (
                <>
                  <span className="tk w-[72px] flex-none text-[14px]">{it.hit.symbol}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg-2">{it.hit.name}</span>
                  <span className="hidden text-[12px] text-fg-3 sm:inline">{subtypeLabel(it.hit.asset_subtype)}</span>
                  <span className="w-[92px] flex-none text-right text-[12px] text-fg-3">{exchangeLabel(it.hit.exchange)}</span>
                </>
              ) : (
                <span className="text-fg-2">{it.label}</span>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-4 border-t border-line bg-bg px-4 py-2.5 text-[12px] text-fg-3">
          <span>↑↓ move</span><span>↵ open</span><span>esc close</span>
        </div>
      </div>
    </div>
  );
}
