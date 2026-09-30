import type { Metadata } from "next";
import Link from "next/link";
import { marketState } from "@/lib/market-hours";
import { fmtDate } from "@/lib/format";
import { FirstRun } from "@/components/FirstRun";
import { GlobeHero } from "@/components/brief/GlobeHero";
import { Icon } from "@/components/Icon";
import { bestPerSymbol } from "@/lib/analysis/events-server";
import { loadMission } from "@/lib/analysis/mission-page";
import { DrawerProvider } from "@/components/mission/SecurityDrawer";
import { MarketPulse } from "@/components/mission/MarketPulse";
import { SignalsTabs } from "@/components/mission/SignalsTabs";
import { AskCommand, type Line } from "@/components/mission/AskCommand";
import { MyWatchlist } from "@/components/mission/MyWatchlist";
import { AttentionSummary, MarketRegime, PortfolioIntelligence, PortfolioSlot, SetupsPanel, SignalCards, WatchlistRail, WhatChangedFeed } from "@/components/mission/Panels";

export const metadata: Metadata = { title: "Mission Control" };
export const dynamic = "force-dynamic";

export default async function MissionControl({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const [m, welcome] = await Promise.all([loadMission(), searchParams.then((p) => p.welcome === "1")]);
  const { ctx, ok, viewer } = m;
  const state = marketState();
  const marketLines: Line[] = [{ text: m.reg.sentence }, ...m.context.map((f) => ({ text: f.text }))];

  return (
    <DrawerProvider>
      <GlobeHero
        title={m.title}
        subtitle={ok ? `Here's what requires attention. ${state.label} Prices are end of day, as of ${fmtDate(m.lastTs)}.` : state.label}
        actions={
          <Link href="/brief" className="btn white lg">
            <Icon name="sparkle" className="h-[14px] w-[14px]" /> Prepare my day
          </Link>
        }
      />

      <AttentionSummary items={m.attention} />
      {!ok && (
        <p className="card px-4 py-3 text-[13px]" style={{ color: "var(--warn)" }} role="status">
          Market data didn&apos;t load this time. Reload in a minute; your watchlist and the tools below still work.
        </p>
      )}

      {welcome && <FirstRun signedIn={!!viewer} name={viewer?.firstName ?? null} suggestions={ctx.active.slice(0, 6).map((r) => ({ symbol: r.symbol, name: r.name }))} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <MarketRegime r={m.reg} b={ctx.breadth} />
            <WhatChangedFeed changes={m.changes} context={m.context} since={m.since} changeDay={m.changeDay} />
          </div>
          <SignalCards counts={ctx.signalCounts} />
          <MarketPulse rows={ctx.pulse} asOf={fmtDate(m.lastTs)} />
          <SignalsTabs events={bestPerSymbol(ctx.events)} data={ctx.signals} day={ctx.events[0]?.day ?? null} />
          <SetupsPanel rows={ctx.setups} record={ctx.record} />
          <AskCommand market={marketLines} improving={m.improving} watchlist={m.watchLines} setups={m.setupLines} />
        </div>
        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-[72px] xl:max-h-[calc(100vh-88px)] xl:self-start xl:overflow-y-auto" aria-label="Your workspace">
          {m.watch.length
            ? <MyWatchlist rows={m.watch} />
            : <WatchlistRail rows={ctx.popular} mode={viewer ? "empty" : "popular"} />}
          {m.portfolio
            ? <PortfolioIntelligence id={m.portfolio.id} name={m.portfolio.name} p={m.portfolio.intel} others={m.saved.length - 1} />
            : <PortfolioSlot saved={m.saved} signedIn={!!viewer} now={new Date().getTime()} />}
        </aside>
      </div>
    </DrawerProvider>
  );
}
