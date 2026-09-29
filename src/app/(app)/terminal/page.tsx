import type { Metadata } from "next";
import { getPulse } from "@/lib/market-data/pulse";
import { greeting, marketState } from "@/lib/market-hours";
import { fmtDate, fmtInt } from "@/lib/format";
import { fmtPrice } from "@/lib/market-data/bars";
import { FirstRun } from "@/components/FirstRun";
import { GlobeHero } from "@/components/brief/GlobeHero";
import { getViewer } from "@/lib/auth";
import { authClient } from "@/lib/supabase/server";
import { bestPerSymbol, getStructureEvents } from "@/lib/analysis/events-server";
import { eventSentence, eventTone, isImproving, type StructureEvent } from "@/lib/analysis/events";
import { entryText } from "@/lib/analysis/setups";
import { SETUP_LABEL } from "@/lib/analysis/candidates";
import { TILES, getMarketContext } from "@/lib/analysis/mission-server";
import {
  PULSE_GROUPS, REGIME_LABEL, closeLabel, fmtPct, regime, returns, waveShort, whatChanged, type DaySection,
} from "@/lib/analysis/mission";
import { DrawerProvider } from "@/components/mission/SecurityDrawer";
import { MarketPulse } from "@/components/mission/MarketPulse";
import { SignalsTabs } from "@/components/mission/SignalsTabs";
import { AskCommand, type Line } from "@/components/mission/AskCommand";
import { PrepareMyDay } from "@/components/mission/PrepareMyDay";
import { MarketRegime, NotConnected, PortfolioSlot, ScannerTiles, SetupsPanel, TodayStrip, WatchlistRail, WhatChangedFeed, type SavedSummary, type Tile, type TodayCell } from "@/components/mission/Panels";

export const metadata: Metadata = { title: "Mission Control" };
export const dynamic = "force-dynamic";

export default async function MissionControl({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const viewer = await getViewer().catch(() => null);
  const watched = viewer
    ? (((await (await authClient()).rpc("my_watchlist")).data ?? []) as { symbol: string }[]).map((r) => r.symbol)
    : [];
  const welcome = (await searchParams).welcome === "1";

  const [{ ctx, ok }, watchChanges, watchPulse, savedRes] = await Promise.all([
    getMarketContext(),
    watched.length ? getStructureEvents({ symbols: watched, days: 1, limit: 60 }).catch(() => [] as StructureEvent[]) : Promise.resolve([] as StructureEvent[]),
    watched.length ? getPulse(watched.slice(0, 40)).catch(() => []) : Promise.resolve([]),
    viewer ? (await authClient()).from("portfolios").select("id, name, updated_at, reviewed_at").order("updated_at", { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
  ]);
  const savedPortfolios = ((savedRes?.data ?? []) as SavedSummary[]);
  const { pulse, breadth, events: marketEvents, setups: topSetups, record, active } = ctx;
  const railMode = watched.length ? "watchlist" : viewer ? "empty" : "popular";
  const railRows = watched.length ? watchPulse : ctx.popular;

  const spy = pulse.find((r) => r.symbol === "SPY") ?? null;
  const lastTs = spy?.last_ts ?? pulse[0]?.last_ts ?? null;
  const since = closeLabel(lastTs);
  const reg = regime(breadth, spy);
  const asChange = (e: StructureEvent) => ({ symbol: e.symbol, text: eventSentence(e), tone: eventTone(e), improving: isImproving(e) });
  const marketChanges = bestPerSymbol(marketEvents).filter((e) => e.weight >= 2).map(asChange);
  const watchSentences = bestPerSymbol(watchChanges).map(asChange);
  const feed = whatChanged({
    pulse, breadth, market: marketChanges, watchlist: watchSentences,
    gainer: ctx.gainer, loser: ctx.loser,
  });
  const tiles: Tile[] = TILES.map((t, i) => ({ label: t.label, hint: t.hint, href: t.href, n: ctx.tileCounts[i] }));
  const m = marketState();
  const name = viewer?.firstName ? `, ${viewer.firstName}` : "";

  // Ask Viridia and Prepare My Day answers, assembled from the same data as the page
  const marketLines: Line[] = [
    { text: reg.sentence },
    ...feed.filter((f) => f.kind === "market" || f.kind === "rates" || f.kind === "macro" || f.kind === "breadth").map((f) => ({ text: f.text })),
  ];
  const improving: Line[] = marketChanges.filter((c) => c.improving).slice(0, 8).map((c) => ({ symbol: c.symbol, text: c.text }));
  const watchLines: Line[] | null = viewer ? watchSentences.map((c) => ({ symbol: c.symbol, text: c.text })) : null;
  const setupLines: Line[] = topSetups.map((r) => ({
    symbol: r.symbol,
    text: `${r.side === "buy" ? "Buy" : "Sell"} · ${SETUP_LABEL[r.kind] ?? r.kind}${r.status === "waiting" ? " (waiting)" : ""} · entry ${r.setup ? entryText(r.setup) : "—"}, stop ${r.setup ? fmtPrice(r.setup.stop.price) : "—"}, target ${r.setup ? fmtPrice(r.setup.target.price) : "—"} · ${r.rr.toFixed(1)} : 1`,
  }));
  const events = Object.fromEntries(watchSentences.map((c) => [c.symbol, c.text]));
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" });
  const by = new Map(pulse.map((r) => [r.symbol, r]));
  const day: DaySection[] = [
    { heading: `Markets through ${since}`, lines: PULSE_GROUPS.map((g) => `${g.label}: ${g.items.map((it) => {
      const r = by.get(it.symbol);
      return r ? `${it.label} ${fmtPct(returns(r).d1)} day, ${fmtPct(returns(r).w1)} week` : null;
    }).filter(Boolean).join("; ")}.`) },
    { heading: "Regime", lines: [reg.sentence] },
    { heading: "What changed", lines: feed.map((f) => (f.symbol && ["structure", "watchlist", "move"].includes(f.kind) ? `${f.symbol}: ${f.text}` : f.text)) },
    { heading: "Watchlist", lines: viewer
      ? watchPulse.map((r) => `${r.symbol} ${fmtPrice(r.close)} (${fmtPct(returns(r).d1)})${waveShort(r.glance_pattern, r.glance_complete, r.glance_wave, r.glance_wave_dir) ? ` · ${waveShort(r.glance_pattern, r.glance_complete, r.glance_wave, r.glance_wave_dir)}` : ""}${r.setup_side ? ` · ${r.setup_side} setup` : ""}${events[r.symbol] ? ` · ${events[r.symbol]}` : ""}`)
      : ["Sign in to include your watchlist."] },
    { heading: "Setups to review", lines: setupLines.map((l) => `${l.symbol}: ${l.text}`) },
  ];

  const spyR = spy ? returns(spy) : null;
  const n = (v: number | null | undefined) => (v == null ? "—" : fmtInt(v));
  const todayCells: TodayCell[] = [
    { title: "Market", href: "/markets", cta: "Markets", lines: spyR ? [
      <span key="s" className={(spyR.d1 ?? 0) >= 0 ? "text-pos" : "text-neg"}>S&amp;P 500 {fmtPct(spyR.d1, 2)}</span>,
      `Regime: ${REGIME_LABEL[reg.id]}`,
      breadth?.measured ? `${Math.round((breadth.uptrend / breadth.measured) * 100)}% of securities in uptrends` : "Breadth measuring",
    ] : ["Market data unavailable"] },
    { title: "Research", href: "/scanner", cta: "Scanner", lines: !ok ? ["Research data unavailable"] : [
      viewer ? `${watchSentences.length} watchlist development${watchSentences.length === 1 ? "" : "s"}` : "Sign in for watchlist developments",
      `${n(ctx.tileCounts[0])} strong structures, ${n(ctx.tileCounts[1])} near a Fib zone`,
      ctx.eventCounts.length ? `${ctx.eventCounts.reduce((a, c) => a + c.n, 0).toLocaleString("en-US")} structural events on liquid names` : "Structural events start after the next session",
    ] },
    savedPortfolios.length
      ? { title: "Portfolio", href: "/portfolio", cta: "Open X-Ray", lines: [
          `${savedPortfolios.length} saved portfolio${savedPortfolios.length === 1 ? "" : "s"}`,
          `${savedPortfolios.filter((p) => !p.reviewed_at).length} never reviewed`,
          "Drift and meeting prep in X-Ray",
        ] }
      : { title: "Portfolio", href: "/portfolio", cta: "Run Portfolio X-Ray", muted: true, lines: ["No saved portfolio", viewer ? "Save one in X-Ray to track drift and prep reviews" : "Check holdings on demand with X-Ray; nothing is stored"] },
    { title: "Clients and calendar", muted: true, lines: ["Not connected yet", "Meetings, clients, earnings and economic calendars need integrations Viridia doesn't have yet"] },
  ];

  return (
    <DrawerProvider>
      <GlobeHero
        title={`${greeting().replace(/\.$/, "")}${name}.`}
        subtitle={ok ? `Here's what changed through ${since}. ${m.label} Prices are end of day, as of ${fmtDate(lastTs)}.` : m.label}
        actions={<PrepareMyDay title={`Prepare my day · ${today}`} sections={day} className="btn sm border-[#F4D38A]/60 bg-[#F4D38A]/15 text-white hover:bg-[#F4D38A]/25" />}
      />

      <TodayStrip cells={todayCells} />
      {!ok && (
        <p className="card px-4 py-3 text-[13px]" style={{ color: "var(--warn)" }} role="status">
          Market data didn&apos;t load this time; the database is busy. Reload in a minute. Your watchlist and the tools below still work.
        </p>
      )}

      {welcome && <FirstRun signedIn={!!viewer} name={viewer?.firstName ?? null} suggestions={active.slice(0, 6).map((r) => ({ symbol: r.symbol, name: r.name }))} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <MarketPulse rows={pulse} asOf={fmtDate(lastTs)} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <MarketRegime r={reg} b={breadth} />
            <WhatChangedFeed items={feed} since={since} />
          </div>
          <SignalsTabs events={bestPerSymbol(marketEvents)} data={ctx.signals} day={marketEvents[0]?.day ?? null} />
          <ScannerTiles tiles={tiles} />
          <SetupsPanel rows={topSetups} record={record} />
          <AskCommand market={marketLines} improving={improving} watchlist={watchLines} setups={setupLines} />
        </div>
        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-[72px] xl:max-h-[calc(100vh-88px)] xl:self-start xl:overflow-y-auto" aria-label="Your workspace">
          <WatchlistRail rows={railRows} events={events} mode={railMode} />
          <PortfolioSlot saved={savedPortfolios} signedIn={!!viewer} now={new Date().getTime()} />
          <NotConnected />
        </aside>
      </div>
    </DrawerProvider>
  );
}
