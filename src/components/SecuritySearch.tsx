"use client";

import { useEffect, useRef, useState, useId } from "react";
import type { SearchHit } from "@/lib/types";
import { exchangeLabel } from "@/lib/format";
import { Icon } from "./Icon";

/**
 * Inline security search (a combobox) for forms such as onboarding and the watchlist.
 * Arrow keys move, Enter picks, Escape closes. `exclude` hides securities already chosen.
 */
export function SecuritySearch({ onPick, exclude = [], placeholder = "Search ticker or company…", autoFocus = false }: {
  onPick: (h: SearchHit) => void; exclude?: number[]; placeholder?: string; autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const term = q.trim();
    if (!term) { setHits([]); return; }
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/securities/search?q=${encodeURIComponent(term)}&limit=8`, { signal: ctl.signal });
        const d = (await r.json()) as { results?: SearchHit[] };
        setHits(d.results ?? []); setSel(0); setOpen(true);
      } catch { /* aborted or offline: keep the last results */ }
      finally { if (!ctl.signal.aborted) setLoading(false); }
    }, 110);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const shown = hits.filter((h) => !exclude.includes(h.id));
  const pick = (h: SearchHit | undefined) => { if (!h) return; onPick(h); setQ(""); setHits([]); setOpen(false); };

  return (
    <div ref={box} className="relative">
      <div className="field flex items-center gap-2 focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--accent-bg)]">
        <Icon name="search" className="h-[15px] w-[15px] text-fg-3" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)} autoFocus={autoFocus}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, shown.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); pick(shown[sel]); }
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder} className="palette-input h-full min-w-0 flex-1 bg-transparent"
          role="combobox" aria-controls={listId} aria-expanded={open && shown.length > 0} aria-autocomplete="list" autoComplete="off" spellCheck={false}
        />
        {loading && <span className="text-[11.5px] text-fg-3">…</span>}
      </div>
      {open && q.trim() && (
        <div id={listId} role="listbox" className="menu absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-[320px] overflow-y-auto">
          {shown.length === 0 && !loading && <div className="px-2.5 py-2 text-[13px] text-fg-3">No listed security matches “{q.trim()}”.</div>}
          {shown.map((h, i) => (
            <button
              key={h.id} role="option" aria-selected={i === sel} data-active={i === sel} className="menu-item"
              onMouseMove={() => setSel(i)} onClick={() => pick(h)}
            >
              <span className="tk w-14 flex-none text-fg">{h.symbol}</span>
              <span className="min-w-0 flex-1 truncate">{h.name}</span>
              <span className="text-[12px] text-fg-3">{exchangeLabel(h.exchange)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
