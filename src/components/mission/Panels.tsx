import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Sparkline } from "@/components/Sparkline";
import { SideChip } from "@/components/analysis/SideChip";
import { HistoryTag } from "@/components/analysis/HistoryTag";
import { GradeChip } from "@/components/analysis/GradeChip";
import { SCENARIO_NOTE } from "@/lib/analysis/scenario";
import { fmtPrice } from "@/lib/market-data/bars";
import { TREND_LABEL, type Breadth } from "@/lib/market-data/snapshot";
import { fmtInt } from "@/lib/format";
import { SETUP_LABEL } from "@/lib/analysis/candidates";
import { entryText } from "@/lib/analysis/setups";
import type { SetupRow } from "@/lib/analysis/setup-scan";
import type { KindRecord } from "@/lib/analysis/track-record";
import { FEED_LABEL, REGIME_LABEL, REGIME_METHOD, fmtPct, returns, waveShort, type FeedItem, type PulseRow, type Regime } from "@/lib/analysis/mission";
import { eventSentence, type ChangeGroup } from "@/lib/analysis/events";
import type { PortfolioIntel } from "@/lib/portfolio/intel";
import { SIGNAL_CARDS, type SignalCount } from "@/lib/analysis/mission-server";
import type { Attention, SavedSummary } from "@/lib/analysis/mission-page";
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

/** Market regime: one uptrend | mixed | downtrend bar sized by share, four participation stats and the reading in words. */
export function MarketRegime({ r, b }: { r: Regime; b: Breadth | null }) {
  const seg = [["Uptrend", r.up, "var(--pos-chart)"], ["Mixed", r.mixed, "var(--neutral)"], ["Downtrend", r.down, "var(--neg)"]] as const;
  const total = b ? b.advancers + b.decliners : 0;
  return (
    <section className="card flex flex-col" aria-labelledby="regime-t">
      <CardHead id="regime-t" title="Market regime" sub={b ? `${fmtInt(b.measured)} securities measured` : undefined}
        action={<Link href="/markets" className="btn ghost sm">Markets</Link>} />
      <div className="flex flex-1 flex-col gap-3 px-4 py-3">
        <div className="text-[16px] font-[650] tracking-[-0.015em]" style={{ color: r.id.includes("up") ? "var(--pos)" : r.id.includes("down") ? "var(--neg)" : undefined }}>
          {REGIME_LABEL[r.id]}
        </div>
        <div className="flex h-7 overflow-hidden rounded-[var(--r-sm)] font-mono text-[10.5px] font-normal uppercase tracking-[0.16em] text-white" role="img"
          aria-label={seg.map(([l, v]) => `${l} ${Math.round(v * 100)}%`).join(", ")}>
          {seg.map(([l, v, c]) => v > 0 && (
            <span key={l} className="flex min-w-0 items-center justify-center overflow-hidden whitespace-nowrap px-1" style={{ width: `${v * 100}%`, background: c }} title={`${l} ${Math.round(v * 100)}%`}>
              {v >= 0.14 ? <>{l} <span className="num ml-1">{Math.round(v * 100)}%</span></> : v >= 0.06 ? <span className="num">{Math.round(v * 100)}%</span> : null}
            </span>
          ))}
        </div>
        <dl className="grid grid-cols-2 border-y border-line sm:grid-cols-4">
          <Stat k="Above 50DMA" v={r.above50 != null ? `${Math.round(r.above50 * 100)}%` : "—"} />
          <Stat k="Near 52W high" v={fmtInt(r.highs)} />
          <Stat k="Near 52W low" v={fmtInt(r.lows)} />
          <Stat k="Adv / Dec" v={total ? `${fmtInt(b!.advancers)} / ${fmtInt(b!.decliners)}` : "—"} />
        </dl>
        <p className="text-[13px] leading-relaxed text-fg-2">{r.sentence.split(":").slice(1).join(":").trim()}</p>
        <p className="mt-auto text-[11.5px] text-fg-3" title={REGIME_METHOD}>How it&apos;s measured: price versus the 50- and 200-day averages; advancers and decliners at the last close.</p>
      </div>
    </section>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="px-2 py-1.5 first:pl-0 sm:border-l sm:border-line sm:first:border-l-0">
      <dt className="text-[11px] text-fg-3">{k}</dt>
      <dd className="num text-[14px] font-[620]">{v}</dd>
    </div>
  );
}

/**
 * What Changed: Viridia's own changes first (structure, wave count, new Fib zones, Fib-zone entries,
 * invalidations, timeframe alignment), each with how many liquid names and a couple of examples;
 * then market context (equities, Treasury proxies, macro, breadth, movers).
 */
export function WhatChangedFeed({ changes, context, since, changeDay }: { changes: ChangeGroup[]; context: FeedItem[]; since: string; changeDay: string | null }) {
  return (
    <section id="changes" className="card flex scroll-mt-20 flex-col" aria-labelledby="changed-t">
      <CardHead id="changed-t" title="What changed" sub={`Through ${since}`} />
      <h3 className="border-b border-line bg-hover/40 px-4 py-1.5 font-mono text-[10.5px] font-normal uppercase tracking-[0.16em] text-fg-3">
        Viridia changes{changeDay ? <span className="ml-2 font-normal normal-case tracking-normal">liquid names, session of {changeDay}</span> : null}
      </h3>
      {changes.length ? (
        <ol className="divide-y divide-line">
          {changes.map((g) => (
            <li key={g.id} className="grid grid-cols-[96px_44px_minmax(0,1fr)] gap-2 px-4 py-1.5">
              <span className="pt-px font-mono text-[10.5px] font-normal uppercase tracking-[0.16em] text-fg-3">{g.label}</span>
              <span className="num pt-px text-right text-[12.5px] font-[620]">{fmtInt(g.n)}</span>
              <span className="flex min-w-0 flex-col gap-0.5 text-[12.5px] leading-snug text-fg-2">
                {g.examples.map((e) => (
                  <span key={e.symbol} className="flex gap-1.5">
                    <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONE[e.tone] }} aria-hidden />
                    <span><TickerButton symbol={e.symbol} className="tk mr-1 text-fg hover:text-brand" />{e.watched && <span className="mr-1 text-[11px] text-brand">watchlist</span>}{e.text}</span>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      ) : <p className="px-4 py-2.5 text-[12.5px] text-fg-3">Viridia compares each session&apos;s analysis with the one before; changes appear once two sessions have been analysed.</p>}
      <h3 className="border-y border-line bg-hover/40 px-4 py-1.5 font-mono text-[10.5px] font-normal uppercase tracking-[0.16em] text-fg-3">Market context</h3>
      {context.length ? (
        <ol className="flex-1 divide-y divide-line">
          {context.map((it, i) => (
            <li key={i} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 px-4 py-1.5">
              <span className="pt-px font-mono text-[10.5px] font-normal uppercase tracking-[0.16em] text-fg-3">{FEED_LABEL[it.kind]}</span>
              <p className="min-w-0 text-[12.5px] leading-snug text-fg-2">
                {it.symbol && it.kind === "move" && <TickerButton symbol={it.symbol} className="tk mr-1.5 text-fg hover:text-brand" />}
                {it.text}
              </p>
            </li>
          ))}
        </ol>
      ) : <p className="px-4 py-2.5 text-[12.5px] text-fg-3">Market data didn&apos;t load.</p>}
    </section>
  );
}

/** Viridia Signals: each structural signal's count, how many are new this session and the change on the prior session; each opens the scanner filtered. */
export function SignalCards({ counts }: { counts: SignalCount[] }) {
  const day = counts[0]?.day ?? null;
  const prior = counts[0]?.prior_day ?? null;
  return (
    <section className="card" aria-labelledby="sig-t">
      <CardHead id="sig-t" title="Viridia signals" sub={`Securities trading $25M+ a day${day ? ` · session of ${day}` : ""}`} action={<Link href="/scanner" className="btn ghost sm">Open scanner</Link>} />
      <ul className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 xl:grid-cols-6">
        {SIGNAL_CARDS.map((c) => {
          const s = counts.find((x) => x.signal === c.id);
          const d = s && s.n_prior != null ? s.n_today - s.n_prior : null;
          return (
            <li key={c.id} className="bg-panel">
              <Link href={c.href} className="flex h-full flex-col gap-1 px-3.5 py-2.5 transition-colors hover:bg-hover" title={c.hint}>
                <span className="font-mono text-[10.5px] font-normal uppercase tracking-[0.16em] text-fg-2">{c.label}</span>
                <span className="num text-[20px] font-[650] leading-none tracking-[-0.02em]">{s ? fmtInt(s.n_today) : "—"}</span>
                <span className="grid grid-cols-2 gap-1 text-[11px] text-fg-3">
                  <span>New <b className="num font-[600] text-fg-2">{s?.new_today != null ? fmtInt(s.new_today) : "—"}</b></span>
                  <span>Δ prior <b className={`num font-[600] ${d == null || d === 0 ? "text-fg-2" : d > 0 ? "text-pos" : "text-neg"}`}>{d == null ? "—" : d > 0 ? `+${fmtInt(d)}` : d < 0 ? `−${fmtInt(-d)}` : "0"}</b></span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {!prior && counts.length > 0 && <div className="src"><span>New today and change versus the prior session fill in once a second session has been analysed.</span></div>}
    </section>
  );
}

/** The attention summary under the greeting: each line is a count that links to where it is explained. */
export function AttentionSummary({ items }: { items: Attention[] }) {
  return (
    <section className="card grid grid-cols-2 gap-px overflow-hidden bg-line md:grid-cols-3 xl:grid-flow-col xl:auto-cols-fr xl:grid-cols-none" aria-label="What requires attention">
      {items.map((it) => (
        <Link key={it.id} href={it.href} className="flex flex-col gap-0.5 bg-panel px-4 py-2.5 transition-colors hover:bg-hover">
          <span className="font-mono text-[10.5px] font-normal uppercase tracking-[0.16em] text-fg-3">{it.label}</span>
          <span className={`num text-[17px] font-[650] tracking-[-0.015em] ${it.tone === "pos" ? "text-pos" : it.tone === "neg" ? "text-neg" : ""}`}>{it.value}</span>
          <span className="text-[12px] leading-snug text-fg-2">{it.detail}</span>
        </Link>
      ))}
    </section>
  );
}

/** Top setups, compact rows; tickers open the drawer. */
export function SetupsPanel({ rows, record }: { rows: SetupRow[]; record: KindRecord[] }) {
  return (
    <section className="card" aria-labelledby="setups-t">
      <CardHead id="setups-t" title="Setups to review" sub="Best replayed record first; 1.5 : 1 or better, invalidation within 20%, $25M+ a day; kinds with a negative record left out"
        action={<><Link href="/setups/track-record" className="btn ghost sm">Track record</Link><Link href="/setups" className="btn ghost sm">All setups</Link></>} />
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="t dense text-[13px]">
            <thead><tr><th>Ticker</th><th>Setup</th><th className="r">Reference</th><th className="r">Invalidation</th><th className="r">Structural target</th><th className="r">R : R</th><th className="r hidden lg:table-cell">History</th><th className="r">Conf.</th></tr></thead>
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
      <div className="src"><span>{SCENARIO_NOTE} Each is checked for sane levels before it is shown; the track record shows how each kind has done.</span></div>
    </section>
  );
}

/** Rail for readers without a watchlist: the most-traded names with price, day, trend and wave. */
export function WatchlistRail({ rows, mode }: { rows: PulseRow[]; mode: "popular" | "empty" }) {
  return (
    <section className="card" aria-labelledby="wl-t">
      <CardHead id="wl-t" title={mode === "popular" ? "Most traded" : "My watchlist"} />
      {(
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
                    {r.setup_side && <span className={r.setup_side === "buy" ? "text-pos" : "text-neg"}>· {r.setup_side === "buy" ? "Bullish" : "Bearish"} scenario</span>}
                  </span>
                </TickerButton>
              </li>
            );
          })}
        </ul>
      ) : <p className="px-4 py-4 text-[13px] text-fg-3">Prices couldn&apos;t be loaded.</p>}
    </section>
  );
}


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

const usd = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** Portfolio Intelligence: the most recently saved portfolio measured with stored end-of-day data. */
export function PortfolioIntelligence({ id, name, p, others }: { id: string; name: string; p: PortfolioIntel; others: number }) {
  const rows: [string, React.ReactNode][] = [
    ["Value", <span key="v" className="num">{usd(p.value)}</span>],
    ["Daily move", p.dayMove != null ? <span key="d" className={`num ${p.dayMove >= 0 ? "text-pos" : "text-neg"}`}>{usd(p.dayMove)} ({fmtPct(p.dayPct, 2)})</span> : <span key="d" className="text-fg-3">—</span>],
    ["Holdings", <span key="h" className="num">{p.holdings}{p.priced < p.holdings ? ` (${p.priced} priced)` : ""}</span>],
    ["Largest exposure", p.largest ? <span key="l"><TickerButton symbol={p.largest.symbol} className="tk hover:text-brand" /> <span className="num">{(p.largest.weight * 100).toFixed(1)}%</span></span> : "—"],
    ["Top contributor", p.contributor ? <span key="c"><TickerButton symbol={p.contributor.symbol} className="tk hover:text-brand" /> <span className="num text-pos">{usd(p.contributor.amount)}</span></span> : "—"],
    ["Top detractor", p.detractor ? <span key="t"><TickerButton symbol={p.detractor.symbol} className="tk hover:text-brand" /> <span className="num text-neg">{usd(p.detractor.amount)}</span></span> : "—"],
  ];
  const list = (syms: string[]) => (syms.length ? syms.map((s, i) => <span key={s}>{i ? ", " : ""}<TickerButton symbol={s} className="tk hover:text-brand" /></span>) : <span className="text-fg-3">None</span>);
  return (
    <section className="card" aria-labelledby="pi-t">
      <CardHead id="pi-t" title="Portfolio intelligence" sub={name} action={<Link href={`/portfolio?id=${id}`} className="btn ghost sm">X-Ray</Link>} />
      <dl className="divide-y divide-line text-[12.5px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-2 px-4 py-1.5"><dt className="text-fg-3">{k}</dt><dd className="ml-auto text-right">{v}</dd></div>
        ))}
        <div className="px-4 py-1.5">
          <dt className="text-fg-3">Structural changes <span className="num text-fg">{p.structural.length}</span></dt>
          {p.structural.length > 0 && (
            <dd className="mt-0.5 flex flex-col gap-0.5 text-[12px] leading-snug text-fg-2">
              {p.structural.slice(0, 4).map((s) => <span key={s.symbol}><TickerButton symbol={s.symbol} className="tk mr-1 hover:text-brand" />{eventSentence(s)}</span>)}
            </dd>
          )}
        </div>
        <div className="flex items-baseline gap-2 px-4 py-1.5"><dt className="text-fg-3">Near invalidation</dt><dd className="ml-auto text-right">{list(p.nearInvalidation)}</dd></div>
        <div className="flex items-baseline gap-2 px-4 py-1.5"><dt className="text-fg-3">Fib events</dt><dd className="ml-auto text-right">{list(p.fibEvents)}</dd></div>
      </dl>
      <div className="src"><span>End-of-day prices; the day&apos;s move needs a prior close for every priced holding.{others > 0 ? ` ${others} other saved portfolio${others === 1 ? "" : "s"} in X-Ray.` : ""}</span></div>
    </section>
  );
}
