"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SearchHit } from "@/lib/types";
import { exchangeLabel, stockHref, subtypeLabel } from "@/lib/format";
import { ALL_NAV } from "@/lib/nav";
import { applyTheme } from "@/lib/theme";
import { browserClient } from "@/lib/supabase/client";
import { track } from "@/lib/track";
import { Icon, type IconName } from "./Icon";
import { useViewer } from "./ViewerProvider";
import { looksLikeQuestion, parseScanQuery, type ScanQuery } from "@/lib/command/scan-query";
import { pushRecent, readRecent, type RecentItem } from "@/lib/command/recent";

type Command = { key: string; label: string; icon: IconName; hint?: string; keywords?: string; run: () => void; group: "Actions" | "Go to" };
/**
 * Row providers, in the order they appear: recent items (empty box), a parsed scanner query, an
 * Ask Viridia question, securities from the master, commands and pages, and "see all matches".
 * New sources (portfolios, clients, documents) slot in as another row kind with its own run().
 */
type Row =
  | { key: string; kind: "security"; hit: SearchHit }
  | { key: string; kind: "command"; cmd: Command }
  | { key: string; kind: "browse"; q: string }
  | { key: string; kind: "scan"; scan: ScanQuery }
  | { key: string; kind: "ask"; text: string }
  | { key: string; kind: "recent"; item: RecentItem };

const TIMEFRAMES = [["1h", "1H"], ["4h", "4H"], ["1d", "1D"], ["1w", "1W"], ["1mo", "1M"]] as const;
const matches = (q: string, text: string) => q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => text.toLowerCase().includes(t));

/**
 * ⌘K: one box for securities, pages and actions. Arrow keys move, Enter runs, Escape closes.
 * Commands are listed first when the box is empty; typing filters them and searches the security master.
 */
export function CommandPalette() {
  const router = useRouter();
  const path = usePathname();
  const { viewer } = useViewer();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [recent, setRecent] = useState<RecentItem[]>([]);
  const show = useCallback(() => { setOpen(true); setQ(""); setHits([]); setSel(0); setError(null); setRecent(readRecent()); }, []);
  const hide = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = /input|textarea|select/i.test(t?.tagName ?? "") || t?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (open) hide(); else show(); }
      else if (e.key === "/" && !typing && !open) { e.preventDefault(); show(); }
      else if (e.key === "[" && !typing && !open && !e.metaKey && !e.ctrlKey) window.dispatchEvent(new Event("viridia:toggle-sidebar"));
      else if (e.key === "Escape" && open) hide();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("viridia:open-palette", show);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("viridia:open-palette", show); };
  }, [open, show, hide]);

  // focus synchronously on open so keystrokes typed right after ⌘K are not lost
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  // Debounced, cancellable search against the security master
  useEffect(() => {
    const term = q.trim();
    if (!term) { setHits([]); setLoading(false); return; }
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/securities/search?q=${encodeURIComponent(term)}&limit=8`, { signal: ctl.signal });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Search failed (${res.status})`);
        const data = (await res.json()) as { results: SearchHit[] };
        setHits(data.results); setSel(0); setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Search isn't responding right now. Try again in a moment.");
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, 110);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  const symbol = path.startsWith("/terminal/") ? decodeURIComponent(path.split("/")[2] ?? "").toUpperCase() : null;

  // remember securities and research pages as they're opened
  useEffect(() => {
    if (symbol) { pushRecent({ kind: "security", label: symbol, sub: document.title.split(" · ")[1], href: `/terminal/${encodeURIComponent(symbol)}` }); return; }
    const qs = window.location.search;
    if (path === "/scanner" && qs) pushRecent({ kind: "research", label: "Scanner query", sub: decodeURIComponent(qs.slice(1)).replace(/&/g, " · "), href: `/scanner${qs}` });
    else if (path === "/portfolio/review" && qs) pushRecent({ kind: "research", label: "Meeting prep", href: `${path}${qs}` });
  }, [path, symbol]);

  const commands = useMemo<Command[]>(() => {
    const nav = (href: string) => () => router.push(href);
    const dark = typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
    const list: Command[] = [];
    if (symbol) {
      list.push({ key: "ask", group: "Actions", icon: "sparkle", label: `Ask Viridia about ${symbol}`, keywords: "ai question explain", run: () => window.dispatchEvent(new Event("viridia:ask")) });
      list.push(viewer
        ? { key: "watch", group: "Actions", icon: "watchlist", label: `Add ${symbol} to watchlist`, keywords: "watch save favorite", run: () => window.dispatchEvent(new Event("viridia:watch")) }
        : { key: "watch", group: "Actions", icon: "watchlist", label: `Sign in to watch ${symbol}`, keywords: "watch save favorite", run: nav(`/signin?next=${encodeURIComponent(path)}`) });
      for (const [tf, label] of TIMEFRAMES)
        list.push({ key: `tf-${tf}`, group: "Actions", icon: "markets", label: `Chart timeframe: ${label}`, keywords: `timeframe interval ${tf}`, run: () => window.dispatchEvent(new CustomEvent("viridia:set-timeframe", { detail: tf })) });
    }
    list.push({ key: "theme", group: "Actions", icon: dark ? "sun" : "moon", label: dark ? "Switch to light theme" : "Switch to dark theme", keywords: "theme appearance dark light mode",
      run: () => { const next = dark ? "light" : "dark"; applyTheme(next); window.dispatchEvent(new CustomEvent("viridia:theme-changed", { detail: next })); } });
    list.push({ key: "sidebar", group: "Actions", icon: "chevronLeft", label: "Toggle sidebar", hint: "[", keywords: "collapse expand navigation", run: () => window.dispatchEvent(new Event("viridia:toggle-sidebar")) });
    if (viewer) list.push({ key: "signout", group: "Actions", icon: "logout", label: "Sign out", keywords: "log out logout", run: async () => { await browserClient().auth.signOut(); router.push("/"); router.refresh(); } });
    else list.push({ key: "signup", group: "Actions", icon: "account", label: "Create an account", keywords: "sign up register join", run: nav("/signup") },
                   { key: "signin", group: "Actions", icon: "account", label: "Sign in", keywords: "log in login", run: nav("/signin") });
    for (const n of ALL_NAV)
      list.push({ key: `nav-${n.href}`, group: "Go to", icon: n.icon, label: n.label, keywords: n.keywords, run: nav(n.auth && !viewer ? `/signin?next=${encodeURIComponent(n.href)}` : n.href) });
    list.push({ key: "nav-prefs", group: "Go to", icon: "settings", label: "Preferences", keywords: "settings theme timeframe defaults", run: nav(viewer ? "/account/preferences" : "/signin?next=%2Faccount%2Fpreferences") });
    return list;
  }, [router, path, symbol, viewer]);

  const term = q.trim();
  const scan = useMemo(() => (term ? parseScanQuery(term) : null), [term]);
  const rows: Row[] = useMemo(() => {
    if (!term) {
      const rec: Row[] = recent.slice(0, 5).map((r) => ({ key: `r-${r.href}`, kind: "recent", item: r }));
      const cmds: Row[] = commands.filter((c) => c.group === "Actions" || c.key.startsWith("nav-")).slice(0, 12).map((c) => ({ key: c.key, kind: "command", cmd: c }));
      return [...rec, ...cmds];
    }
    const cmds = commands.filter((c) => matches(term, `${c.label} ${c.keywords ?? ""}`)).slice(0, 6);
    const secs: Row[] = hits.map((h) => ({ key: `s${h.id}`, kind: "security", hit: h }));
    const cmdRows: Row[] = cmds.map((c) => ({ key: c.key, kind: "command", cmd: c }));
    const scanRow: Row[] = scan ? [{ key: "scan", kind: "scan", scan }] : [];
    const question = looksLikeQuestion(term) || (term.split(/\s+/).length >= 3 && !scan);
    const askRow: Row[] = question ? [{ key: "ask", kind: "ask", text: term }] : [];
    // a ticker-like query shows securities first; a phrase shows the scan or question first
    const tickerish = /^[A-Za-z.\-]{1,6}$/.test(term) && hits.length > 0;
    const browse: Row[] = hits.length ? [{ key: "browse", kind: "browse", q: term }] : [];
    return tickerish ? [...secs, ...scanRow, ...askRow, ...cmdRows, ...browse] : [...scanRow, ...askRow, ...cmdRows, ...secs, ...browse];
  }, [term, commands, hits, scan, recent]);

  const run = (i: number) => {
    const r = rows[i];
    if (!r) return;
    hide();
    if (r.kind === "security") { void track("ticker_searched", { symbol: r.hit.symbol }); pushRecent({ kind: "security", label: r.hit.symbol, sub: r.hit.name, href: stockHref(r.hit.symbol) }); router.push(stockHref(r.hit.symbol)); }
    else if (r.kind === "browse") router.push(`/markets/stocks?q=${encodeURIComponent(r.q)}`);
    else if (r.kind === "scan") { pushRecent({ kind: "research", label: "Scanner query", sub: r.scan.parts.join(" · "), href: r.scan.href }); router.push(r.scan.href); }
    else if (r.kind === "ask") {
      // on a security page the question goes to that security's Ask Viridia; elsewhere to Mission Control's
      if (symbol) window.dispatchEvent(new CustomEvent("viridia:ask", { detail: r.text }));
      else router.push(`/terminal?ask=${encodeURIComponent(r.text)}`);
    }
    else if (r.kind === "recent") router.push(r.item.href);
    else r.cmd.run();
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;
  let lastGroup = "";
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-[rgba(9,45,34,0.18)] px-4 pt-[12vh]"
      role="dialog" aria-modal="true" aria-label="Command menu"
      onMouseDown={(e) => { if (e.target === e.currentTarget) hide(); }}
    >
      <div className="w-full max-w-[640px] overflow-hidden rounded-[var(--r-lg)] border border-line bg-panel" style={{ boxShadow: "var(--shadow-lg)", animation: "pop var(--t-fast) var(--ease)" }}>
        <div className="flex items-center gap-3 border-b border-line px-4 text-fg-3">
          <Icon name="search" />
          <input
            ref={inputRef} autoFocus value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, rows.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); run(sel); }
            }}
            placeholder="Search securities or ask Viridia…"
            className="palette-input h-[54px] min-w-0 flex-1 bg-transparent text-[15.5px] tracking-[-0.01em] text-fg"
            autoComplete="off" spellCheck={false} role="combobox" aria-expanded="true" aria-controls="palette-results"
            aria-activedescendant={rows[sel] ? `pal-${rows[sel].key}` : undefined}
          />
          {loading && <span className="text-[11.5px]">Searching…</span>}
        </div>
        <div ref={listRef} id="palette-results" className="max-h-[400px] overflow-y-auto p-1.5" role="listbox">
          {error && <div className="px-3 py-3 text-[12.5px] text-neg">{error}</div>}
          {term && !loading && !error && rows.length === 0 && (
            <div className="px-3 py-5 text-[13px] text-fg-2">Nothing matches “{term}”. Try a ticker (NVDA), a company, a scan (“wave 3 stocks near a fib zone”) or a question.</div>
          )}
          {rows.map((r, i) => {
            const group = r.kind === "command" ? r.cmd.group : r.kind === "security" ? "Securities" : r.kind === "recent" ? "Recent" : r.kind === "scan" || r.kind === "ask" ? "Viridia" : "";
            const header = group && group !== lastGroup ? group : null;
            lastGroup = group || lastGroup;
            return (
              <div key={r.key}>
                {header && <div className="px-3 pb-1 pt-2.5 text-[11.5px] font-medium text-fg-3">{header}</div>}
                <div
                  id={`pal-${r.key}`} data-i={i} role="option" aria-selected={i === sel}
                  onMouseMove={() => sel !== i && setSel(i)} onClick={() => run(i)}
                  className={`flex h-10 cursor-pointer items-center gap-3 rounded-[var(--r-md)] px-3 ${i === sel ? "bg-hover" : ""}`}
                >
                  {r.kind === "security" ? (
                    <>
                      <span className="tk w-[68px] flex-none text-[13.5px]">{r.hit.symbol}</span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg-2">{r.hit.name}</span>
                      <span className="hidden text-[12px] text-fg-3 sm:inline">{subtypeLabel(r.hit.asset_subtype)}</span>
                      <span className="w-[88px] flex-none text-right text-[12px] text-fg-3">{exchangeLabel(r.hit.exchange)}</span>
                    </>
                  ) : r.kind === "recent" ? (
                    <>
                      <Icon name={r.item.kind === "security" ? "stocks" : "research"} className="h-[15px] w-[15px] text-fg-3" />
                      <span className={`${r.item.kind === "security" ? "tk" : ""} text-[13.5px]`}>{r.item.label}</span>
                      {r.item.sub && <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-3">{r.item.sub}</span>}
                    </>
                  ) : r.kind === "scan" ? (
                    <>
                      <Icon name="scanner" className="h-[15px] w-[15px] text-brand" />
                      <span className="text-[13.5px]">Scan:</span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg-2">{r.scan.parts.join(" · ")}</span>
                    </>
                  ) : r.kind === "ask" ? (
                    <>
                      <Icon name="sparkle" className="h-[15px] w-[15px] text-brand" />
                      <span className="text-[13.5px]">Ask Viridia{symbol ? ` about ${symbol}` : ""}:</span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg-2">{r.text}</span>
                    </>
                  ) : r.kind === "command" ? (
                    <>
                      <Icon name={r.cmd.icon} className="h-[15px] w-[15px] text-fg-3" />
                      <span className="flex-1 truncate text-[13.5px]">{r.cmd.label}</span>
                      {r.cmd.hint && <kbd>{r.cmd.hint}</kbd>}
                    </>
                  ) : (
                    <span className="text-[13.5px] text-fg-2">See all matches for “{r.q}”</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 border-t border-line bg-bg px-4 py-2 text-[12px] text-fg-3">
          <span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
