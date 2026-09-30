import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/supabase";
import type { SearchHit, Security, SecurityEvent } from "@/lib/types";
import { exchangeLabel, fmtDate, fmtDateTime, stockHref, subtypeLabel } from "@/lib/format";
import { toProviderSymbol } from "@/lib/market-data/symbols";
import { fmtChange, fmtPrice, fmtVolume, type BarSummary } from "@/lib/market-data/bars";
import { fmtDollars, type Snapshot } from "@/lib/market-data/snapshot";
import { SourceFooter } from "@/components/SourceFooter";
import { PriceChart } from "@/components/PriceChart";
import { StructureSummary } from "@/components/StructureSummary";
import { AskViridiaButton } from "@/components/AskViridiaPanel";
import { getAnalysisHistory, getDailyAnalysis, getWeeklyGlance } from "@/lib/analysis/server";
import { WaveCounts } from "@/components/WaveCounts";
import { FibMap } from "@/components/analysis/FibMap";
import { getStructureEvents } from "@/lib/analysis/events-server";
import { EVENT_LABEL, eventSentence, eventTone, type StructureEvent } from "@/lib/analysis/events";
import { WatchButton } from "@/components/WatchButton";
import { TrackEvent } from "@/components/TrackEvent";
import { WelcomeGuide } from "@/components/WelcomeGuide";
import { DegreeProvider } from "@/components/analysis/DegreeContext";
import { StructureGlance } from "@/components/analysis/StructureGlance";
import { SetupCard, type SetupCheck } from "@/components/analysis/SetupCard";
import { getSymbolTrials, getSetupQuality, getTrackRecord } from "@/lib/analysis/track-record";
import { computeSignals } from "@/lib/analysis/signals";
import { SignalsPanel } from "@/components/analysis/SignalsPanel";
import { getFundamentals, getSectorMedians } from "@/lib/fundamentals/server";
import type { SectorMedian } from "@/lib/fundamentals/model";

type Props = { params: Promise<{ symbol: string }>; searchParams: Promise<{ welcome?: string }> };

async function load(symbol: string) {
  const { data, error } = await db().from("securities").select("*")
    .eq("symbol", symbol).order("is_active", { ascending: false }).order("last_updated", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Security | null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase();
  try {
    const sec = await load(symbol);
    return { title: sec ? `${sec.symbol} · ${sec.name}` : symbol };
  } catch {
    return { title: symbol };
  }
}

// Only sections that exist are shown; financials, earnings and ownership arrive with research data.
const SECTIONS = [["summary", "Summary"], ["structure", "Structure"], ["candidates", "Candidates"], ["fibonacci", "Fibonacci"], ["evidence", "Evidence"], ["engine", "Engine details"]] as const;

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-[112px] flex-col gap-4" aria-labelledby={`${id}-h`}>
      <div className="flex items-baseline gap-3 border-b border-line pb-1.5">
        <h2 id={`${id}-h`} className="font-mono text-[10.5px] font-normal uppercase tracking-[0.16em] text-fg-3">{title}</h2>
        {note && <span className="text-[12px] text-fg-3">{note}</span>}
      </div>
      {children}
    </section>
  );
}

export default async function StockTerminal({ params, searchParams }: Props) {
  const welcome = (await searchParams).welcome === "1";
  const symbol = decodeURIComponent((await params).symbol).toUpperCase();
  const sec = await load(symbol);

  if (!sec) {
    const { data } = await db().rpc("search_securities", { q: symbol, lim: 6, include_inactive: true });
    const hits = (data ?? []) as SearchHit[];
    return (
      <div className="card mx-auto flex w-full max-w-[680px] flex-col items-center gap-3 px-8 py-14 text-center">
        <h1 className="h3">No listed security with the symbol {symbol}</h1>
        <p className="max-w-[500px] text-fg-2">Viridia covers every security in the daily NYSE and NASDAQ symbol directories. A new listing appears after the next morning sync.</p>
        {hits.length > 0 && (
          <div className="mt-3 w-full text-left">
            <div className="label mb-1.5 px-3">Closest matches</div>
            {hits.map((h) => (
              <Link key={h.id} href={stockHref(h.symbol)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-hover">
                <span className="tk w-16">{h.symbol}</span><span className="flex-1 truncate text-fg-2">{h.name}</span>
                <span className="text-[12px] text-fg-3">{exchangeLabel(h.exchange)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  const [events, mappings, summaryRes, snapRes, swings, weekly, history, record, barsRes, spyRes, trials, fund, medians, quality, changes, checkRes] = await Promise.all([
    db().from("security_events").select("*").eq("security_id", sec.id).order("id", { ascending: false }).limit(20),
    db().from("security_provider_symbols").select("provider, provider_symbol, valid_from").eq("security_id", sec.id),
    db().rpc("get_bar_summary", { p_symbol: sec.symbol }),
    db().rpc("get_snapshot", { p_symbol: sec.symbol }),
    getDailyAnalysis(sec.symbol).catch(() => null),
    getWeeklyGlance(sec.symbol).catch(() => null),
    getAnalysisHistory(sec.symbol, 10).catch(() => []),
    getTrackRecord().catch(() => []),
    db().rpc("get_bars", { p_symbol: sec.symbol, p_timeframe: "1d", p_limit: 300 }),
    db().rpc("get_bars", { p_symbol: "SPY", p_timeframe: "1d", p_limit: 300 }),
    getSymbolTrials(sec.symbol, 40).catch(() => []),
    getFundamentals([sec.symbol]).then((r) => r[0] ?? null).catch(() => undefined),
    getSectorMedians().catch(() => [] as SectorMedian[]),
    getSetupQuality().catch(() => []),
    getStructureEvents({ symbols: [sec.symbol], days: 30, limit: 12 }).catch(() => [] as StructureEvent[]),
    db().rpc("setup_check", { p_symbol: sec.symbol }),
  ]);
  const setupCheck = (checkRes.data ?? null) as SetupCheck | null;
  const sectorMedian = fund?.sector ? medians.find((m) => m.sector === fund.sector) ?? null : null;
  const sum = (summaryRes.data ?? null) as BarSummary | null;
  const snap = (snapRes.data ?? null) as Snapshot | null;
  const evts = (events.data ?? []) as SecurityEvent[];
  const hasPrice = sum?.last_close != null;
  const chg = hasPrice && sum!.prev_close ? sum!.last_close! - sum!.prev_close : null;
  const chgPct = chg != null && sum!.prev_close ? chg / sum!.prev_close : null;
  const edgar = sec.cik ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${sec.cik}&type=&dateb=&owner=include&count=40` : null;
  const stored = (mappings.data ?? []) as { provider: string; provider_symbol: string; valid_from: string }[];
  const providerRows = [
    // one row per provider and symbol (stored mappings repeat when a listing changes and changes back)
    ...stored.filter((m, i) => stored.findIndex((x) => x.provider === m.provider && x.provider_symbol === m.provider_symbol) === i)
      .map((m) => ({ provider: m.provider, symbol: m.provider_symbol })),
    ...(["massive"] as const).filter((p) => !stored.some((m) => m.provider === p)).map((p) => ({ provider: p, symbol: toProviderSymbol(sec.symbol, p) })),
  ];
  const coverage = sum?.coverage === "full" ? "Automatic, updated nightly" : sum?.coverage === "on_demand" ? "On demand, then updated nightly" : "Fetched when first opened";

  return (
    <>
      <TrackEvent event="analysis_viewed" props={{ symbol: sec.symbol }} />
      <DegreeProvider auto={swings?.glances.auto?.degree ?? null}>
      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-3">
              <h1 className="text-[clamp(40px,4vw,56px)] font-[400] leading-none tracking-[-0.02em]">{sec.symbol}</h1>
              {!sec.is_active && <span className="chip neg">Delisted {fmtDate(sec.delisted_on)}</span>}
            </div>
            <p className="mt-2 text-[16px] text-fg-2">{sec.name}</p>
            <p className="mt-1 text-[13px] text-fg-3">{exchangeLabel(sec.exchange)} · {subtypeLabel(sec.asset_subtype)}{sec.sector ? ` · ${sec.sector}` : ""}</p>
          </div>
          {hasPrice && (
            <div>
              <div className="num text-[34px] font-[600] leading-none tracking-[-0.03em]">{fmtPrice(sum!.last_close)}</div>
              {chg != null && (
                <div className={`num mt-2 text-[15px] font-medium ${chg >= 0 ? "text-pos" : "text-neg"}`}>
                  {chg >= 0 ? "+" : "−"}{fmtChange(chg, sum!.last_close!)} ({chg >= 0 ? "+" : "−"}{(Math.abs(chgPct!) * 100).toFixed(2)}%)
                </div>
              )}
              <p className="mt-1 text-[12.5px] text-fg-3">Close, {fmtDate(sum!.last_ts)}</p>
            </div>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <WatchButton securityId={sec.id} symbol={sec.symbol} />
            <AskViridiaButton
              symbol={sec.symbol} close={sum?.last_close ?? null} glances={swings?.glances ?? null}
              candidates={swings?.candidates ?? null} zones={swings?.fib?.zones ?? []} setups={swings?.setups ?? null}
              setupReasons={swings?.setupReasons ?? null} weekly={weekly} history={history}
            />
          </div>
        </div>
        <nav className="sticky top-[56px] z-20 -mb-2 flex gap-5 overflow-x-auto border-b border-line bg-bg/95 backdrop-blur" aria-label="Security sections">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="whitespace-nowrap border-b-2 border-transparent py-2.5 text-[13.5px] font-[550] text-fg-2 hover:border-line-2 hover:text-fg">{label}</a>
          ))}
          {edgar && <a href={edgar} target="_blank" rel="noreferrer" className="ml-auto whitespace-nowrap py-2.5 text-[13.5px] font-[550] text-fg-3 hover:text-fg">SEC filings ↗</a>}
        </nav>
      </header>

      {welcome && <WelcomeGuide symbol={sec.symbol} />}

      <Section id="summary" title="Structural summary" note="What is the structure, what changed, and what would invalidate it">
        <SignalsPanel
          symbol={sec.symbol} trials={trials}
          dims={computeSignals({
            bars: (barsRes.data ?? []) as { ts: string; close: number }[], benchmark: (spyRes.data ?? []) as { ts: string; close: number }[],
            trend: snap?.trend ?? null, sma50: snap?.sma50 ?? null, sma200: snap?.sma200 ?? null,
            glance: swings?.glances.auto ?? null, weekly,
            swing: swings?.pivots.degrees.intermediate.structure ?? null, zones: swings?.fib?.zones ?? null,
            fundamentals: fund, sector: sectorMedian,
          })}
        />
        <StructureGlance
          symbol={sec.symbol} glances={swings?.glances ?? null} candidates={swings?.candidates ?? null}
          zones={swings?.fib?.zones ?? []} close={sum?.last_close ?? null} asOf={swings?.asOf} weekly={weekly}
        />
        <RecentChanges events={changes} />
      </Section>

      <Section id="structure" title="Current structure" note="Price, swings and the preferred count on the chart">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <PriceChart symbol={sec.symbol} zones={swings?.fib?.zones ?? []} counts={swings?.candidates ?? null} />
          <StructureSummary snap={snap} swings={swings} />
        </div>
      </Section>

      <Section id="candidates" title="Candidate interpretations" note="Every count shown passes every hard rule">
        <WaveCounts data={swings?.candidates ?? null} glances={swings?.glances ?? null} asOf={swings?.asOf} version={swings?.version} source={swings?.source} />
      </Section>

      <Section id="fibonacci" title="Fibonacci map">
        <FibMap fib={swings?.fib ?? null} />
      </Section>

      <Section id="evidence" title="Evidence" note="The setup the preferred count implies, and how that kind of setup has done">
        <SetupCard setups={swings?.setups ?? null} reasons={swings?.setupReasons ?? null} close={sum?.last_close ?? null} record={record} quality={quality} check={setupCheck} />
      </Section>

      <Section id="engine" title="Engine details">
        <div className="card">
          <dl className="kv px-5 py-5">
            <dt>Analysis engine</dt><dd className="num">{swings?.version ?? "—"}</dd>
            <dt>Bars analysed to</dt><dd className="num">{swings?.asOf ? fmtDate(swings.asOf) : "—"}</dd>
            <dt>Price history</dt><dd>{coverage}</dd>
            <dt>Daily bars</dt><dd className="num">{sum?.bars_1d ? `${sum.bars_1d.toLocaleString("en-US")} since ${fmtDate(sum.first_ts)}` : "—"}</dd>
            <dt>Avg volume, 50 days</dt><dd className="num">{fmtVolume(sum?.avg_volume_50d)}</dd>
            <dt>Dollar volume, 20 days</dt><dd className="num">{fmtDollars(snap?.adv20)}</dd>
            <dt>SEC CIK</dt><dd className="num">{sec.cik ?? "Not matched"}</dd>
            <dt>Provider symbols</dt><dd className="num">{providerRows.map((r) => `${r.provider}: ${r.symbol}`).join(" · ")}</dd>
            <dt>Listing changes</dt><dd>{evts.length ? `${evts.length} recorded` : `None since ${fmtDate(sec.first_seen_at)}`}</dd>
          </dl>
          <SourceFooter source="Prices: Massive (end of day, split-adjusted). Listings: Nasdaq Trader, SEC" updated={fmtDateTime(sec.last_seen_at)} method="Security master, daily snapshot diff" />
        </div>
      </Section>
      </DegreeProvider>
    </>
  );
}

/** Structural events for this security over the last month (deterministic comparisons of sessions). */
function RecentChanges({ events }: { events: StructureEvent[] }) {
  const tone = { pos: "var(--pos-chart)", neg: "var(--neg)", neutral: "var(--border-2)" } as const;
  return (
    <div className="card">
      <div className="card-h"><h3 className="card-t">What changed</h3><span className="card-s">Structural events, most recent first</span></div>
      {events.length ? (
        <ul className="divide-y divide-line">
          {events.map((e, i) => (
            <li key={i} className="flex items-baseline gap-3 px-5 py-2 text-[13px]">
              <span className="h-1.5 w-1.5 shrink-0 self-center rounded-full" style={{ background: tone[eventTone(e)] }} aria-hidden />
              <span className="num w-20 shrink-0 text-fg-3">{fmtDate(e.day)}</span>
              <span className="w-[150px] shrink-0 font-mono text-[10.5px] font-normal uppercase tracking-[0.16em] text-fg-3">{EVENT_LABEL[e.type]}</span>
              <span className="min-w-0 flex-1 text-fg-2">{eventSentence(e)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="px-5 py-4 text-[13px] text-fg-3">No structural events recorded yet. Events compare each analysed session with the previous one.</p>}
    </div>
  );
}
