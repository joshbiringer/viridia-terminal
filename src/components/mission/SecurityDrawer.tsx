"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { Sparkline } from "@/components/Sparkline";
import { ViridiaMark } from "@/components/ViridiaMark";
import { WatchButton } from "@/components/WatchButton";
import { fmtPrice } from "@/lib/market-data/bars";
import { TREND_LABEL, fmtDollars } from "@/lib/market-data/snapshot";
import { stockHref } from "@/lib/format";
import { SETUP_LABEL, type SetupKind } from "@/lib/analysis/candidates";
import { confidenceBand, fmtPct, returns, waveShort, type SecurityPreview } from "@/lib/analysis/mission";

type Ctx = { open: (symbol: string) => void; symbol: string | null };
const DrawerCtx = createContext<Ctx>({ open: () => {}, symbol: null });
export const useDrawer = () => useContext(DrawerCtx);

const cache = new Map<string, Promise<SecurityPreview | { error: string }>>();
/** Fetches (once per page) the compact preview behind the drawer and the Ask Viridia comparison. */
export function loadPreview(symbol: string) {
  const key = symbol.toUpperCase();
  if (!cache.has(key)) {
    cache.set(key, fetch(`/api/preview/${encodeURIComponent(key)}`)
      .then(async (r) => (r.ok ? r.json() : { error: (await r.json().catch(() => null))?.error ?? "The preview couldn't be loaded." }))
      .catch(() => ({ error: "The preview couldn't be loaded." })));
  }
  return cache.get(key)!;
}

/**
 * Mission Control's right-side security drawer. Any ticker on the page opens it (TickerButton), so a
 * reader can look at price, structure, confidence, the nearest Fibonacci zone and any setup without
 * leaving the page, then open full research or Ask Viridia from there.
 */
export function DrawerProvider({ children }: { children: ReactNode }) {
  const [symbol, setSymbol] = useState<string | null>(null);
  const [data, setData] = useState<SecurityPreview | { error: string } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const current = useRef<string | null>(null);

  const open = useCallback((s: string) => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    const key = s.toUpperCase();
    current.current = key;
    setSymbol(key);
    setData(null);
    loadPreview(key).then((d) => { if (current.current === key) setData(d); });
    requestAnimationFrame(() => closeRef.current?.focus());
  }, []);
  const close = useCallback(() => {
    current.current = null;
    setSymbol(null);
    returnFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const shown = symbol && data && !("error" in data) && data.symbol === symbol ? data : null;
  const err = symbol && data && "error" in data ? data.error : null;

  return (
    <DrawerCtx.Provider value={{ open, symbol }}>
      {children}
      {symbol && <div className="fixed inset-0 z-50 bg-[rgba(9,45,34,0.14)]" onClick={close} aria-hidden />}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-line bg-panel transition-transform duration-200 ${symbol ? "translate-x-0" : "translate-x-full"}`}
        style={{ boxShadow: symbol ? "var(--shadow-lg)" : undefined }}
        aria-label={symbol ? `${symbol} preview` : "Security preview"} aria-hidden={!symbol} inert={!symbol}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[18px] font-[650] tracking-[-0.02em]">{symbol}</span>
              {shown?.exchange && <span className="text-[12px] text-fg-3">{shown.exchange}</span>}
            </div>
            <div className="truncate text-[13px] text-fg-2">{shown?.name ?? (err ? "" : "Loading…")}</div>
          </div>
          <button ref={closeRef} className="btn ghost sm px-2" onClick={close} aria-label="Close preview"><Icon name="x" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {err ? <p className="px-5 py-6 text-[13.5px] text-fg-2">{err}</p>
            : shown ? <PreviewBody p={shown} /> : <div className="px-5 py-6"><div className="h-24 animate-pulse rounded-[var(--r-md)] bg-hover" /></div>}
        </div>
        {symbol && !err && (
          <div className="flex gap-2 border-t border-line px-5 py-3.5">
            <Link href={stockHref(symbol)} className="btn pri flex-1 justify-center">Open research</Link>
            <Link href={`${stockHref(symbol)}?ask=1`} className="btn flex-1 justify-center"><ViridiaMark size={14} /> Ask Viridia</Link>
            {shown && <WatchButton securityId={shown.id} symbol={shown.symbol} />}
          </div>
        )}
      </aside>
    </DrawerCtx.Provider>
  );
}

function Row({ k, v, note, tone }: { k: string; v: ReactNode; note?: ReactNode; tone?: "pos" | "neg" | "warn" }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <dt className="text-[12.5px] text-fg-3">{k}</dt>
      <dd className={`num ml-auto text-right text-[13px] font-[560] ${tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : ""}`} style={tone === "warn" ? { color: "var(--warn)" } : undefined}>
        {v}{note && <div className="text-[11.5px] font-normal text-fg-3">{note}</div>}
      </dd>
    </div>
  );
}

const toneOf = (v: number | null) => (v == null ? undefined : v >= 0 ? "pos" : "neg");

function PreviewBody({ p }: { p: SecurityPreview }) {
  const r = returns(p);
  const d = p.daily, s = p.setup, z = p.zone;
  const count = d ? waveShort(d.pattern, d.complete, d.wave, d.wave_dir) : null;
  const weekly = p.weekly ? waveShort(p.weekly.pattern, p.weekly.complete, p.weekly.wave, p.weekly.wave_dir) : null;
  const band = confidenceBand(d?.score);
  const last = p.history[0], before = p.history[1];
  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <div className="flex items-end gap-4">
        <div>
          <div className="num text-[26px] font-[650] leading-none tracking-[-0.03em]">{fmtPrice(p.close)}</div>
          <div className={`num mt-1 text-[13px] font-medium ${toneOf(r.d1) === "pos" ? "text-pos" : "text-neg"}`}>{fmtPct(r.d1, 2)} <span className="font-normal text-fg-3">day</span></div>
        </div>
        {p.spark && p.spark.length > 1 && <Sparkline values={p.spark} width={170} height={44} className="ml-auto" />}
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        {([["1 week", r.w1], ["1 month", r.m1], ["52-wk position", null]] as [string, number | null][]).map(([k, v], i) => (
          <div key={k} className="rounded-[var(--r-md)] border border-line px-2 py-2">
            <dt className="text-[11.5px] text-fg-3">{k}</dt>
            <dd className={`num text-[13px] font-[600] ${i < 2 ? (toneOf(v) === "pos" ? "text-pos" : v == null ? "" : "text-neg") : ""}`}>
              {i < 2 ? fmtPct(v) : p.high_52w && p.low_52w && p.close ? `${Math.round(((p.close - p.low_52w) / (p.high_52w - p.low_52w || 1)) * 100)}%` : "—"}
            </dd>
          </div>
        ))}
      </dl>

      <section>
        <h3 className="label mb-1">Trend and structure</h3>
        <dl className="divide-y divide-line">
          <Row k="Trend" v={p.trend ? TREND_LABEL[p.trend] : "—"} note="Price versus 50- and 200-day averages" tone={p.trend === "uptrend" ? "pos" : p.trend === "downtrend" ? "neg" : undefined} />
          <Row k="Daily count" v={count ?? "No count yet"} note={d?.degree ? `${d.degree[0].toUpperCase()}${d.degree.slice(1)} degree, preferred` : undefined} />
          <Row k="Pattern Confidence" v={d?.score != null ? `${d.score} · ${band}` : "—"} note={d?.alt_score != null ? `Alternate count ${d.alt_score}` : undefined} />
          <Row k="Weekly count" v={weekly ?? "—"} />
          {d?.hold != null && <Row k="Invalidation" v={fmtPrice(d.hold)} note={d.hold_side ? `Count is wrong ${d.hold_side === "below" ? "below" : "above"} this level` : undefined} tone="warn" />}
        </dl>
      </section>

      <section>
        <h3 className="label mb-1">Nearest Fibonacci zone</h3>
        {z ? (
          <dl className="divide-y divide-line">
            <Row k="Zone" v={`${fmtPrice(z.low)} – ${fmtPrice(z.high)}`} note={`${z.count} overlapping levels · ${z.side === "above" ? "above" : "below"} price`} />
            <Row k="Distance" v={fmtPct(z.distancePct)} />
          </dl>
        ) : <p className="text-[13px] text-fg-3">No confluence zone near the preferred count.</p>}
      </section>

      <section>
        <h3 className="label mb-1">Setup</h3>
        {s ? (
          <dl className="divide-y divide-line">
            <Row k={s.side === "buy" ? "Buy" : "Sell"} v={SETUP_LABEL[s.kind as SetupKind] ?? s.kind} note={s.status === "waiting" ? "Waiting for entry" : "Active"} tone={s.side === "buy" ? "pos" : "neg"} />
            <Row k="Entry" v={s.entry.low === s.entry.high ? fmtPrice(s.entry.low) : `${fmtPrice(s.entry.low)} – ${fmtPrice(s.entry.high)}`} />
            <Row k="Stop" v={fmtPrice(s.stop.price)} tone="neg" />
            <Row k="Target" v={fmtPrice(s.target.price)} tone="pos" />
            <Row k="Reward : risk" v={`${s.rr.toFixed(1)} : 1`} />
          </dl>
        ) : <p className="text-[13px] text-fg-3">No setup passes the checks for this count right now.</p>}
      </section>

      <section>
        <h3 className="label mb-1">Recent and upcoming</h3>
        <ul className="flex flex-col gap-1.5 text-[13px] text-fg-2">
          {last ? (
            <li>
              {before && (before.wave_dir !== last.wave_dir || before.pattern !== last.pattern)
                ? <>Count changed on {last.day}: now {waveShort(last.pattern, false, last.wave, last.wave_dir)}.</>
                : <>Count unchanged at the last recorded session ({last.day}).</>}
            </li>
          ) : <li>No recorded structure history yet.</li>}
          <li className="text-fg-3">Earnings and economic calendars aren&apos;t connected yet.</li>
          {p.adv20 != null && <li className="text-fg-3">Trades {fmtDollars(p.adv20)} a day (20-day average).</li>}
        </ul>
      </section>
    </div>
  );
}

/** A ticker that opens the drawer; middle-click and modified clicks still follow the link. */
export function TickerButton({ symbol, className = "", children }: { symbol: string; className?: string; children?: ReactNode }) {
  const { open } = useDrawer();
  return (
    <Link
      href={stockHref(symbol)} className={className} prefetch={false}
      onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); open(symbol); }}
    >
      {children ?? symbol}
    </Link>
  );
}
