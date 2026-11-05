import type { Metadata } from "next";
import Link from "next/link";
import { marketState } from "@/lib/market-hours";
import { FirstRun } from "@/components/FirstRun";
import { Icon } from "@/components/Icon";
import { bestPerSymbol } from "@/lib/analysis/events-server";
import { loadMission } from "@/lib/analysis/mission-page";
import { DrawerProvider } from "@/components/mission/SecurityDrawer";
import { GlobalPulse } from "@/components/mission/GlobalPulse";
import { DataStatus } from "@/components/mission/DataStatus";
import { AutoRefresh } from "@/components/mission/AutoRefresh";
import { Opportunities } from "@/components/mission/Opportunities";
import { SignalsTabs } from "@/components/mission/SignalsTabs";
import { AskCommand, type Line } from "@/components/mission/AskCommand";
import { MyWatchlist } from "@/components/mission/MyWatchlist";
import { AttentionSummary, MarketRegime, PortfolioIntelligence, PortfolioSlot, SetupsPanel, StructuralChanges, WatchlistRail } from "@/components/mission/Panels";

export const metadata: Metadata = { title: "Mission Control" };
export const dynamic = "force-dynamic";

/** "Good morning, Josh." → the name in italic; otherwise the last word. */
function Headline({ text }: { text: string }) {
  const comma = text.indexOf(",");
  if (comma > 0) return <>{text.slice(0, comma + 1)} <em>{text.slice(comma + 1).trim()}</em></>;
  const sp = text.trimEnd().lastIndexOf(" ");
  return sp < 0 ? <em>{text}</em> : <>{text.slice(0, sp)} <em>{text.slice(sp + 1)}</em></>;
}

function Disclosure({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <details className="card group overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 transition-colors hover:bg-hover [&::-webkit-details-marker]:hidden">
        <Icon name="chevronRight" className="h-[13px] w-[13px] text-fg-3 transition-transform group-open:rotate-90" />
        <span className="card-t">{title}</span>
        <span className="truncate text-[12px] text-fg-3">{hint}</span>
      </summary>
      <div className="border-t border-line">{children}</div>
    </details>
  );
}

/**
 * Mission Control: a compact research workstation. The world's sessions and the major indices, what
 * requires attention, then regime and breadth beside the best bullish and bearish opportunities, the
 * session's structural changes and the reader's watchlist, with Ask Viridia above the fold.
 * Deeper detail (signal lists, the full setups table) opens on demand.
 */
export default async function MissionControl({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const [m, welcome] = await Promise.all([loadMission(), searchParams.then((p) => p.welcome === "1")]);
  const { ctx, ok, viewer, freshness: f } = m;
  const state = marketState();
  const marketLines: Line[] = [{ text: m.reg.sentence }, ...m.context.map((c) => ({ text: c.text }))];
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" });

  return (
    <DrawerProvider>
      <AutoRefresh />
      <header className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[12.5px] text-fg-3">{today} · {state.label}</p>
          <h1 className="serif mt-1 text-[clamp(30px,3vw,40px)] leading-[1.02] text-fg"><Headline text={m.title} /></h1>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <DataStatus f={f} s={m.dataStatus} />
          <Link href="/brief" className="btn pri"><Icon name="sparkle" className="h-[14px] w-[14px]" /> Prepare my day</Link>
        </div>
      </header>

      {!ok && (
        <p className="card px-4 py-3 text-[13px]" style={{ color: "var(--warn)" }} role="status">
          Market data didn&apos;t load this time. The page retries on its own; your watchlist and the tools below still work.
        </p>
      )}
      {ok && f.state === "behind" && (
        <p className="card flex items-center gap-2 px-4 py-2.5 text-[13px]" style={{ color: "var(--warn)", background: "var(--warn-bg)" }} role="status">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--warn)]" aria-hidden />{f.detail} Loading is retried automatically.
        </p>
      )}

      {welcome && <FirstRun signedIn={!!viewer} name={viewer?.firstName ?? null} suggestions={ctx.active.slice(0, 6).map((r) => ({ symbol: r.symbol, name: r.name }))} />}

      <GlobalPulse rows={ctx.pulse} freshness={f} />
      <AttentionSummary items={m.attention} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <AskCommand market={marketLines} improving={m.improving} watchlist={m.watchLines} setups={m.setupLines} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <MarketRegime r={m.reg} b={ctx.breadth} context={m.context} />
            <Opportunities bullish={ctx.bullish} bearish={ctx.bearish} />
          </div>
          <div className="cv-auto"><StructuralChanges changes={m.changes} changeDay={m.changeDay} counts={ctx.signalCounts} /></div>
          <Disclosure title="Signal detail" hint="Wave candidates, Fib confluence, near invalidation, multi-timeframe">
            <SignalsTabs bare events={bestPerSymbol(ctx.events)} data={ctx.signals} day={ctx.events[0]?.day ?? null} />
          </Disclosure>
          <Disclosure title="All setups to review" hint="Reference, invalidation, structural target and replayed history">
            <SetupsPanel bare rows={ctx.setups.slice(0, 10)} record={ctx.record} />
          </Disclosure>
        </div>
        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-[84px] xl:max-h-[calc(100vh-100px)] xl:self-start xl:overflow-y-auto" aria-label="Your workspace">
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
