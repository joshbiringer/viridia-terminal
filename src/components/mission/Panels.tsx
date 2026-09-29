import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Sparkline } from "@/components/Sparkline";
import { SideChip } from "@/components/analysis/SideChip";
import { HistoryTag } from "@/components/analysis/HistoryTag";
import { GradeChip } from "@/components/analysis/GradeChip";
import { fmtPrice } from "@/lib/market-data/bars";
import { TREND_LABEL, type Breadth } from "@/lib/market-data/snapshot";
import { fmtInt } from "@/lib/format";
import { SETUP_LABEL } from "@/lib/analysis/candidates";
import { entryText } from "@/lib/analysis/setups";
import type { SetupRow } from "@/lib/analysis/setup-scan";
import type { KindRecord } from "@/lib/analysis/track-record";
import { FEED_LABEL, REGIME_METHOD, fmtPct, returns, waveShort, type FeedItem, type PulseRow, type Regime } from "@/lib/analysis/mission";
import { TickerButton } from "./SecurityDrawer";

const TONE = { pos: "var(--pos-chart)", neg: "var(--neg)", neutral: "var(--border-2)" } as const;
const TREND_DOT = { uptrend: "var(--pos-chart)", mixed: "var(--neutral)", downtrend: "var(--neg)", insufficient: "var(--border-2)" } as const;

export function CardHead({ title, sub, action, id }: { title: string; sub?: React.ReactNode; action?: React.ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-line px-4 py-2.5">
      <h2 id={id} className="card-t">{title}</h2>
      {sub && <span className="text-[12px] text-fg-3">{sub}</span>}
      {action && <span className="ml-auto flex gap-1.5">{action}</span>}
    </div>
  );
}

/** Market regime: uptrend / mixed / downtrend shares, participation and 52-week extremes, with the reading in words. */
export function MarketRegime({ r, b }: { r: Regime; b: Breadth | null }) {
  const seg = [["Uptrend", r.up, "var(--pos-chart)"], ["Mixed", r.mixed, "var(--neutral)"], ["Downtrend", r.down, "var(--neg)"]] as const;
  const hiLo = r.highs + r.lows;
  return (
    <section className="card flex flex-col" aria-labelledby="regime-t">
      <CardHead id="regime-t" title="Market regime" sub={b ? `${fmtInt(b.measured)} securities measured` : undefined}
        action={<Link href="/markets" className="btn ghost sm">Markets</Link>} />
      <div className="flex flex-1 flex-col gap-3.5 px-4 py-3.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[20px] font-[650] tracking-[-0.02em]" style={{ color: r.id.includes("up") ? "var(--pos)" : r.id.includes("down") ? "var(--neg)" : undefined }}>
            {r.sentence.split(":")[0]}
          </span>
        </div>
        <div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-hover" role="img" aria-label={seg.map(([l, v]) => `${l} ${Math.round(v * 100)}%`).join(", ")}>
            {seg.map(([l, v, c]) => <i key={l} style={{ width: `${v * 100}%`, background: c }} />)}
          </div>
          <div className="mt-1.5 flex gap-4 text-[12px]">
            {seg.map(([l, v, c]) => (
              <span key={l} className="inline-flex items-center gap-1.5 text-fg-2"><span className="dot" style={{ background: c }} />{l} <span className="num font-medium text-fg">{Math.round(v * 100)}%</span></span>
            ))}
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-2">
          <Stat k="Above 50-day" v={r.above50 != null ? `${Math.round(r.above50 * 100)}%` : "—"} bar={r.above50} />
          <Stat k="Near 52w highs" v={fmtInt(r.highs)} bar={hiLo ? r.highs / hiLo : null} color="var(--pos-chart)" />
          <Stat k="Near 52w lows" v={fmtInt(r.lows)} bar={hiLo ? r.lows / hiLo : null} color="var(--neg)" />
        </dl>
        <p className="text-[13px] leading-relaxed text-fg-2">{r.sentence.split(":").slice(1).join(":").trim()}</p>
        <p className="mt-auto text-[11.5px] text-fg-3" title={REGIME_METHOD}>How it&apos;s measured: price versus the 50- and 200-day averages.</p>
      </div>
    </section>
  );
}

function Stat({ k, v, bar, color = "var(--brand)" }: { k: string; v: string; bar: number | null; color?: string }) {
  return (
    <div className="rounded-[var(--r-md)] border border-line px-2.5 py-2">
      <dt className="text-[11.5px] text-fg-3">{k}</dt>
      <dd className="num text-[15px] font-[620]">{v}</dd>
      {bar != null && <div className="mt-1 h-1 overflow-hidden rounded-full bg-hover"><i className="block h-full" style={{ width: `${Math.min(1, bar) * 100}%`, background: color }} /></div>}
    </div>
  );
}

/** What Changed: 5–8 developments in plain sentences, each tagged by kind, tickers open the drawer. */
export function WhatChangedFeed({ items, since }: { items: FeedItem[]; since: string }) {
  return (
    <section className="card flex flex-col" aria-labelledby="changed-t">
      <CardHead id="changed-t" title="What changed" sub={`Through ${since}`} />
      {items.length ? (
        <ol className="flex-1 divide-y divide-line">
          {items.map((it, i) => (
            <li key={i} className="flex gap-3 px-4 py-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONE[it.tone] }} aria-hidden />
              <span className="w-[74px] shrink-0 pt-px text-[11.5px] font-[560] uppercase tracking-[0.04em] text-fg-3">{FEED_LABEL[it.kind]}</span>
              <p className="min-w-0 flex-1 text-[13px] leading-snug text-fg-2">
                {it.symbol && (it.kind === "structure" || it.kind === "watchlist" || it.kind === "move") && <TickerButton symbol={it.symbol} className="tk mr-1.5 text-fg hover:text-brand" />}
                {it.text}
              </p>
            </li>
          ))}
        </ol>
      ) : <p className="px-4 py-5 text-[13px] text-fg-3">Nothing to report yet.</p>}
    </section>
  );
}

export interface Tile { label: string; hint: string; n: number | null; href: string }

/** Market Scanner tiles: live counts of each structure preset, each opening the scanner filtered. */
export function ScannerTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <section className="card" aria-labelledby="tiles-t">
      <CardHead id="tiles-t" title="Market scanner" sub="Securities trading $25M+ a day" action={<Link href="/scanner" className="btn ghost sm">Open scanner</Link>} />
      <ul className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <li key={t.label} className="bg-panel">
            <Link href={t.href} className="flex h-full flex-col px-4 py-2.5 transition-colors hover:bg-hover" title={t.hint}>
              <span className="num text-[18px] font-[650] tracking-[-0.02em]">{fmtInt(t.n)}</span>
              <span className="text-[12px] leading-tight text-fg-2">{t.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Top setups, compact rows; tickers open the drawer. */
export function SetupsPanel({ rows, record }: { rows: SetupRow[]; record: KindRecord[] }) {
  return (
    <section className="card" aria-labelledby="setups-t">
      <CardHead id="setups-t" title="Setups to review" sub="Best replayed record first; 1.5 : 1 or better, stop within 20%, $25M+ a day; kinds with a negative record left out"
        action={<><Link href="/setups/track-record" className="btn ghost sm">Track record</Link><Link href="/setups" className="btn ghost sm">All setups</Link></>} />
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="t dense text-[13px]">
            <thead><tr><th>Ticker</th><th>Setup</th><th className="r">Entry</th><th className="r">Stop</th><th className="r">Target</th><th className="r">R : R</th><th className="r hidden lg:table-cell">History</th><th className="r">Conf.</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol}>
                  <td><TickerButton symbol={r.symbol} className="tk hover:text-brand" /></td>
                  <td><span className="inline-flex items-center gap-2"><SideChip side={r.side} short />{SETUP_LABEL[r.kind] ?? r.kind}{r.status === "waiting" && <span className="text-[12px] text-fg-3">waiting</span>}</span></td>
                  <td className="r num">{r.setup ? entryText(r.setup) : "—"}</td>
                  <td className="r num text-neg">{r.setup ? fmtPrice(r.setup.stop.price) : "—"}</td>
                  <td className="r num text-pos">{r.setup ? fmtPrice(r.setup.target.price) : "—"}</td>
                  <td className="r num font-medium">{r.rr.toFixed(1)}</td>
                  <td className="r hidden lg:table-cell"><span className="flex flex-col items-end gap-0.5"><GradeChip grade={r.grade} avgR={r.kind_avg_r} /><HistoryTag h={record.find((x) => x.kind === r.kind && x.side === r.side)} /></span></td>
                  <td className="r num">{r.score ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="px-4 py-5 text-[13px] text-fg-2">No liquid setup at 1.5 : 1 or better right now.</p>}
      <div className="src"><span>Research output from each security&apos;s preferred count, not a recommendation. The track record shows how each kind has done.</span></div>
    </section>
  );
}

/** Right-rail watchlist: price, day, trend and wave; the latest structure change as the event line. */
export function WatchlistRail({ rows, events, mode }: {
  rows: PulseRow[]; events: Record<string, string>; mode: "watchlist" | "popular" | "empty";
}) {
  return (
    <section className="card" aria-labelledby="wl-t">
      <CardHead id="wl-t" title={mode === "popular" ? "Most traded" : "Watchlist"}
        sub={mode === "watchlist" ? `${rows.length}` : undefined}
        action={mode === "watchlist" ? <Link href="/watchlist" className="btn ghost sm">Manage</Link> : undefined} />
      {mode !== "watchlist" && (
        <p className="border-b border-line px-4 py-2 text-[12.5px] text-fg-2">
          {mode === "popular"
            ? <><Link href="/signin?next=/terminal" className="text-brand hover:underline">Sign in</Link> to keep a watchlist here. Meanwhile, the most-traded names:</>
            : <>Your watchlist is empty. Add names from any security page, or start with the most traded:</>}
        </p>
      )}
      {rows.length ? (
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const d1 = returns(r).d1;
            const wave = waveShort(r.glance_pattern, r.glance_complete, r.glance_wave, r.glance_wave_dir);
            return (
              <li key={r.symbol}>
                <TickerButton symbol={r.symbol} className="block px-4 py-2 transition-colors hover:bg-hover">
                  <span className="flex items-center gap-2">
                    {r.trend && <span className="dot" style={{ background: TREND_DOT[r.trend] }} title={TREND_LABEL[r.trend]} />}
                    <span className="tk w-14 text-[13px]">{r.symbol}</span>
                    <Sparkline values={r.spark} width={48} height={18} className="shrink-0" />
                    <span className="num ml-auto text-[13px]">{fmtPrice(r.close)}</span>
                    <span className={`num w-[58px] text-right text-[12.5px] font-medium ${d1 == null ? "text-fg-3" : d1 >= 0 ? "text-pos" : "text-neg"}`}>{fmtPct(d1)}</span>
                  </span>
                  <span className="mt-0.5 flex gap-2 pl-4 text-[11.5px] text-fg-3">
                    <span className="truncate">{wave ?? "No count yet"}</span>
                    {r.setup_side && <span className={r.setup_side === "buy" ? "text-pos" : "text-neg"}>· {r.setup_side} setup</span>}
                  </span>
                  {events[r.symbol] && <span className="mt-0.5 block pl-4 text-[11.5px] leading-snug" style={{ color: "var(--warn)" }}>{events[r.symbol]}</span>}
                </TickerButton>
              </li>
            );
          })}
        </ul>
      ) : <p className="px-4 py-4 text-[13px] text-fg-3">Prices couldn&apos;t be loaded.</p>}
    </section>
  );
}

export interface SavedSummary { id: string; name: string; updated_at: string; reviewed_at: string | null }

export function PortfolioSlot({ saved, signedIn, now }: { saved: SavedSummary[]; signedIn: boolean; now: number }) {
  const ago = (iso: string) => {
    const d = Math.floor((now - Date.parse(iso)) / 864e5);
    return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
  };
  return (
    <section className="card" aria-labelledby="pf-t">
      <CardHead id="pf-t" title="Portfolios" action={saved.length ? <Link href="/portfolio" className="btn ghost sm">X-Ray</Link> : undefined} />
      {saved.length ? (
        <ul className="divide-y divide-line">
          {saved.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-4 py-2">
              <Link href={`/portfolio?id=${p.id}`} className="min-w-0 flex-1 truncate text-[13px] font-[560] hover:text-brand">{p.name}</Link>
              <span className="text-[11.5px] text-fg-3">{p.reviewed_at ? `reviewed ${ago(p.reviewed_at)}` : "not reviewed"}</span>
              <Link href={`/portfolio/review?id=${p.id}`} className="btn ghost sm px-2 text-[12px]">Prep</Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-2.5 px-4 py-3">
          <p className="text-[12.5px] leading-relaxed text-fg-2">
            {signedIn ? "Save a portfolio in X-Ray to track drift against targets and prepare review meetings here." : "Paste or upload holdings to see concentration, risk, correlation and each position's wave structure. Nothing is stored unless you sign in and save it."}
          </p>
          <Link href="/portfolio" className="btn sm self-start"><Icon name="gauge" className="h-[14px] w-[14px]" /> Run Portfolio X-Ray</Link>
        </div>
      )}
    </section>
  );
}

export function NotConnected() {
  return (
    <section className="card" aria-labelledby="nc-t">
      <CardHead id="nc-t" title="Calendar and alerts" />
      <ul className="flex flex-col gap-1.5 px-4 py-3 text-[12.5px] text-fg-3">
        <li>Economic calendar: no data source yet.</li>
        <li>Earnings calendar: no data source yet.</li>
        <li>Alerts: not available yet.</li>
        <li><Link href="/data-sources" className="text-brand hover:underline">Coverage and limitations</Link></li>
      </ul>
    </section>
  );
}

export interface TodayCell { title: string; lines: React.ReactNode[]; href?: string; cta?: string; muted?: boolean }

/** The Today strip under the greeting: market, research, portfolio and clients at a glance. */
export function TodayStrip({ cells }: { cells: TodayCell[] }) {
  return (
    <section className="card grid grid-cols-2 gap-px overflow-hidden bg-line lg:grid-cols-4" aria-label="Today">
      {cells.map((c) => (
        <div key={c.title} className="flex flex-col gap-1 bg-panel px-4 py-3">
          <div className="text-[11.5px] font-[600] uppercase tracking-[0.06em] text-fg-3">{c.title}</div>
          <ul className={`flex flex-col gap-0.5 text-[13px] leading-snug ${c.muted ? "text-fg-3" : "text-fg-2"}`}>
            {c.lines.map((l, i) => <li key={i} className={i === 0 && !c.muted ? "font-[560] text-fg" : ""}>{l}</li>)}
          </ul>
          {c.href && c.cta && <Link href={c.href} className="mt-auto pt-1 text-[12.5px] text-brand hover:underline">{c.cta} →</Link>}
        </div>
      ))}
    </section>
  );
}
