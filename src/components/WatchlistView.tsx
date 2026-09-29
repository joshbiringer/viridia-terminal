"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SearchHit } from "@/lib/types";
import { exchangeLabel, fmtDate, stockHref } from "@/lib/format";
import { fmtPrice } from "@/lib/market-data/bars";
import { type Trend } from "@/lib/market-data/snapshot";
import { SWING_LABEL, type SwingStructure } from "@/lib/analysis/pivots";
import { addToWatchlist, removeFromWatchlist, saveWatchNote } from "@/lib/watchlist";
import { EVENT_LABEL, eventSentence, eventTone, type EventType } from "@/lib/analysis/events";
import { waveShort } from "@/lib/analysis/mission";
import { SecuritySearch } from "./SecuritySearch";
import { TrendLabel } from "./TrendLabel";
import { EmptyState } from "./ui/EmptyState";
import { Icon } from "./Icon";

export type WatchRow = {
  watchlist_id: string; security_id: number; symbol: string; name: string; exchange: string | null; asset_type: string;
  close: number | null; prev_close: number | null; change_pct: number | null; trend: Trend | null;
  high_52w: number | null; low_52w: number | null; adv20: number | null; last_ts: string | null;
  swing: SwingStructure | null; zones: number; added_at: string; notes?: string | null;
  pattern?: string | null; complete?: boolean | null; wave?: string | null; wave_dir?: string | null; score?: number | null;
  zone_low?: number | null; zone_high?: number | null; event_type?: EventType | null; event_day?: string | null; event_detail?: Record<string, unknown> | null;
};

const SWING_TONE: Partial<Record<SwingStructure, string>> = { higher_highs_lows: "text-pos", lower_highs_lows: "text-neg" };

export function WatchlistView({ userId, initial, asOf }: { userId: string; initial: WatchRow[]; asOf: string | null }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const add = async (h: SearchHit) => {
    setErr(null);
    try {
      await addToWatchlist(userId, h.id, h.symbol);
      start(() => router.refresh());
      // show it right away; market data fills in on refresh
      setRows((r) => r.some((x) => x.security_id === h.id) ? r : [...r, {
        watchlist_id: "", security_id: h.id, symbol: h.symbol, name: h.name, exchange: h.exchange, asset_type: h.asset_type,
        close: null, prev_close: null, change_pct: null, trend: null, high_52w: null, low_52w: null, adv20: null, last_ts: null,
        swing: null, zones: 0, added_at: new Date().toISOString(),
      }]);
    } catch (e) { setErr((e as Error).message); }
  };
  const remove = async (id: number) => {
    const before = rows;
    setRows((r) => r.filter((x) => x.security_id !== id));
    try { await removeFromWatchlist(id); } catch (e) { setRows(before); setErr((e as Error).message); }
  };

  // after a refresh the server sends complete market data for newly added rows (derived during render)
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) { setSeen(initial); setRows(initial); }

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
        <div className="w-full sm:max-w-[360px]"><SecuritySearch onPick={add} exclude={rows.map((r) => r.security_id)} placeholder="Add a ticker or company…" /></div>
        <span className="caption ml-auto">{rows.length} {rows.length === 1 ? "security" : "securities"}{asOf ? ` · close ${fmtDate(asOf)}` : ""}</span>
      </div>
      {err && <p className="border-b border-line px-5 py-2.5 text-[13px] text-neg">{err}</p>}
      {rows.length === 0 ? (
        <EmptyState
          icon="watchlist" title="Build your market radar"
          body="Add the securities you follow to see their trend, swing structure and nearby Fibonacci zones side by side, updated after every close."
        >
          <Link href="/scanner" className="btn">Browse the scanner</Link>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="t dense min-w-[980px] text-[13px]">
            <thead>
              <tr>
                <th>Security</th><th className="r">Price</th><th className="r">Change</th><th>Trend</th>
                <th>Structure</th><th>Candidate wave</th><th className="r">Nearest Fib zone</th><th>Last structural change</th><th>Notes</th><th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const wave = waveShort(r.pattern, r.complete, r.wave, r.wave_dir);
                const zDist = r.close && r.zone_low != null && r.zone_high != null
                  ? (r.close >= r.zone_low && r.close <= r.zone_high ? 0 : ((r.zone_low + r.zone_high) / 2) / r.close - 1) : null;
                const ev = r.event_type ? { type: r.event_type, detail: r.event_detail ?? {} } : null;
                return (
                  <tr key={r.security_id}>
                    <td>
                      <Link href={stockHref(r.symbol)} className="flex items-baseline gap-2.5">
                        <span className="tk w-14">{r.symbol}</span>
                        <span className="max-w-[200px] truncate text-fg-2">{r.name}</span>
                        <span className="text-[12px] text-fg-3">{exchangeLabel(r.exchange)}</span>
                      </Link>
                    </td>
                    <td className="r num">{r.close != null ? fmtPrice(r.close) : <span className="text-fg-3">—</span>}</td>
                    <td className={`r num ${r.change_pct == null ? "text-fg-3" : r.change_pct >= 0 ? "text-pos" : "text-neg"}`}>
                      {r.change_pct == null ? "—" : `${r.change_pct >= 0 ? "+" : "−"}${Math.abs(r.change_pct * 100).toFixed(2)}%`}
                    </td>
                    <td>{r.trend ? <TrendLabel trend={r.trend} /> : <span className="text-fg-3">—</span>}</td>
                    <td className={r.swing ? SWING_TONE[r.swing] ?? "" : "text-fg-3"}>{r.swing ? SWING_LABEL[r.swing] : "—"}</td>
                    <td>{wave ? <span title={r.score != null ? `Pattern Confidence ${r.score}` : undefined}>{wave}{r.score != null && <span className="num text-fg-3"> · {r.score}</span>}</span> : <span className="text-fg-3">No count yet</span>}</td>
                    <td className="r num">
                      {r.zone_low != null && r.zone_high != null ? (
                        <span title={`${fmtPrice(r.zone_low)}–${fmtPrice(r.zone_high)}`}>
                          {fmtPrice(r.zone_low)}–{fmtPrice(r.zone_high)}
                          <span className="text-fg-3"> {zDist === 0 ? "· inside" : zDist != null ? `· ${zDist > 0 ? "+" : "−"}${Math.abs(zDist * 100).toFixed(1)}%` : ""}</span>
                        </span>
                      ) : <span className="text-fg-3">—</span>}
                    </td>
                    <td className="max-w-[260px]">
                      {ev ? (
                        <span className="flex items-baseline gap-2" title={eventSentence(ev)}>
                          <span className="h-1.5 w-1.5 shrink-0 self-center rounded-full" style={{ background: eventTone(ev) === "pos" ? "var(--pos-chart)" : eventTone(ev) === "neg" ? "var(--neg)" : "var(--border-2)" }} aria-hidden />
                          <span className="truncate">{EVENT_LABEL[ev.type]}</span>
                          <span className="num shrink-0 text-[12px] text-fg-3">{fmtDate(r.event_day)}</span>
                        </span>
                      ) : <span className="text-fg-3">None recorded</span>}
                    </td>
                    <td className="w-[200px]"><NoteCell id={r.security_id} initial={r.notes ?? ""} /></td>
                    <td className="w-10 !px-2">
                      <button className="btn ghost sm px-2 text-fg-3" onClick={() => remove(r.security_id)} aria-label={`Remove ${r.symbol}`} title="Remove">
                        <Icon name="x" className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** An inline note for one watched security; saved when the field loses focus. */
function NoteCell({ id, initial }: { id: number; initial: string }) {
  const [v, setV] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const save = async () => {
    if (v === initial && state !== "error") return;
    setState("saving");
    try { await saveWatchNote(id, v); setState("saved"); } catch { setState("error"); }
  };
  return (
    <span className="flex items-center gap-1.5">
      <input className="field h-7 w-full min-w-0 text-[12.5px]" value={v} maxLength={1000} placeholder="Add a note" aria-label="Note"
        onChange={(e) => { setV(e.target.value); setState("idle"); }} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      {state === "saved" && <Icon name="check" className="h-3.5 w-3.5 shrink-0 text-pos" />}
      {state === "error" && <span className="shrink-0 text-[11.5px] text-neg" title="The note couldn't be saved">!</span>}
    </span>
  );
}
