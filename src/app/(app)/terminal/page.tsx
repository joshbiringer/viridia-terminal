import type { Metadata } from "next";
import { getBreadth, scan } from "@/lib/market-data/snapshot";
import { getPulse } from "@/lib/market-data/pulse";
import { greeting, marketState } from "@/lib/market-hours";
import { fmtDate } from "@/lib/format";
import { fmtPrice } from "@/lib/market-data/bars";
import { FirstRun } from "@/components/FirstRun";
import { GlobeHero } from "@/components/brief/GlobeHero";
import { getViewer } from "@/lib/auth";
import { authClient } from "@/lib/supabase/server";
import { getChanges } from "@/lib/analysis/brief";
import { setupScan } from "@/lib/analysis/setup-scan";
import { entryText } from "@/lib/analysis/setups";
import { SETUP_LABEL } from "@/lib/analysis/candidates";
import { getTrackRecord } from "@/lib/analysis/track-record";
import {
  PULSE_GROUPS, PULSE_SYMBOLS, changeSentence, closeLabel, fmtPct, regime, returns, waveShort, whatChanged, type DaySection,
} from "@/lib/analysis/mission";
import { DrawerProvider } from "@/components/mission/SecurityDrawer";
import { MarketPulse } from "@/components/mission/MarketPulse";
import { AskCommand, type Line } from "@/components/mission/AskCommand";
import { PrepareMyDay } from "@/components/mission/PrepareMyDay";
import { MarketRegime, NotConnected, PortfolioSlot, ScannerTiles, SetupsPanel, WatchlistRail, WhatChangedFeed, type Tile } from "@/components/mission/Panels";

export const metadata: Metadata = { title: "Mission Control" };
export const dynamic = "force-dynamic";

const LIQUID = 25_000_000; // $25M average daily dollar volume
const DV = `dv=${LIQUID}`;
const TILES: (Omit<Tile, "n"> & { params: Record<string, unknown> })[] = [
  { label: "Strong structure", hint: "Preferred daily count with Pattern Confidence 70+", href: `/scanner?score=70&${DV}&sort=confidence`, params: { p_min_score: 70 } },
  { label: "Near a Fib zone", hint: "Within 3% of a Fibonacci confluence zone", href: `/scanner?s=near_zone&${DV}`, params: { p_structure: "near_zone" } },
  { label: "Near 52-week high", hint: "Trading near the 52-week high", href: `/scanner?near=high&${DV}`, params: { p_near: "high" } },
  { label: "Wave 3 in progress", hint: "Preferred count is in wave 3", href: `/scanner?s=wave3&${DV}`, params: { p_structure: "wave3" } },
  { label: "Correction complete", hint: "An A-B-C correction has completed", href: `/scanner?s=abc_done&${DV}`, params: { p_structure: "abc_done" } },
  { label: "Near invalidation", hint: "Within 3% of the level that breaks the preferred count", href: `/scanner?s=near_invalidation&${DV}`, params: { p_structure: "near_invalidation" } },
];

export default async function MissionControl({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const viewer = await getViewer().catch(() => null);
  const watched = viewer
    ? (((await (await authClient()).rpc("my_watchlist")).data ?? []) as { symbol: string }[]).map((r) => r.symbol)
    : [];
  const welcome = (await searchParams).welcome === "1";

  const [pulse, breadth, changes, watchChanges, gainers, losers, topSetups, record, active, watchPulse, ...tileRows] = await Promise.all([
    getPulse(PULSE_SYMBOLS).catch(() => []),
    getBreadth().catch(() => null),
    getChanges({ minDollarVolume: LIQUID, limit: 40 }).catch(() => []),
    watched.length ? getChanges({ symbols: watched, limit: 20 }).catch(() => []) : Promise.resolve([]),
    scan({ p_sort: "change", p_limit: 1, p_min_dollar_volume: LIQUID }).catch(() => []),
    scan({ p_sort: "change_asc", p_limit: 1, p_min_dollar_volume: LIQUID }).catch(() => []),
    setupScan({ p_sort: "confidence", p_limit: 6, p_min_rr: 1.5, p_min_dollar_volume: LIQUID }).catch(() => []),
    getTrackRecord().catch(() => []),
    scan({ p_sort: "dollar_volume", p_limit: 8 }).catch(() => []),
    watched.length ? getPulse(watched.slice(0, 40)).catch(() => []) : Promise.resolve([]),
    ...TILES.map((t) => scan({ ...t.params, p_limit: 1, p_min_dollar_volume: LIQUID }).catch(() => [])),
  ]);
  const railMode = watched.length ? "watchlist" : viewer ? "empty" : "popular";
  const railRows = watched.length ? watchPulse : await getPulse(active.map((r) => r.symbol)).catch(() => []);

  const spy = pulse.find((r) => r.symbol === "SPY") ?? null;
  const lastTs = spy?.last_ts ?? pulse[0]?.last_ts ?? null;
  const since = closeLabel(lastTs);
  const reg = regime(breadth, spy);
  const marketChanges = changes.map(changeSentence);
  const watchSentences = watchChanges.map(changeSentence);
  const feed = whatChanged({
    pulse, breadth, market: marketChanges, watchlist: watchSentences,
    gainer: gainers[0] ?? null, loser: losers[0] ?? null,
  });
  const tiles: Tile[] = TILES.map((t, i) => ({ label: t.label, hint: t.hint, href: t.href, n: tileRows[i]?.[0]?.total ?? 0 }));
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

  return (
    <DrawerProvider>
      <GlobeHero
        title={`${greeting().replace(/\.$/, "")}${name}.`}
        subtitle={`Here's what changed through ${since}. ${m.label} Prices are end of day, as of ${fmtDate(lastTs)}.`}
        actions={<PrepareMyDay title={`Prepare my day · ${today}`} sections={day} className="btn sm border-[#F4D38A]/60 bg-[#F4D38A]/15 text-white hover:bg-[#F4D38A]/25" />}
      />

      {welcome && <FirstRun signedIn={!!viewer} name={viewer?.firstName ?? null} suggestions={active.slice(0, 6).map((r) => ({ symbol: r.symbol, name: r.name }))} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <AskCommand market={marketLines} improving={improving} watchlist={watchLines} setups={setupLines} />
          <MarketPulse rows={pulse} asOf={fmtDate(lastTs)} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <MarketRegime r={reg} b={breadth} />
            <WhatChangedFeed items={feed} since={since} />
          </div>
          <ScannerTiles tiles={tiles} />
          <SetupsPanel rows={topSetups} record={record} />
        </div>
        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-[72px] xl:max-h-[calc(100vh-88px)] xl:self-start xl:overflow-y-auto" aria-label="Your workspace">
          <WatchlistRail rows={railRows} events={events} mode={railMode} />
          <PortfolioSlot />
          <NotConnected />
        </aside>
      </div>
    </DrawerProvider>
  );
}
