/**
 * Everything Mission Control and the Prepare My Day briefing show, assembled once per request from
 * the shared market context (cached) and the reader's own watchlist and saved portfolio. Both pages
 * read the same object, so the briefing never disagrees with the dashboard.
 */
import { greeting } from "@/lib/market-hours";
import { fmtInt } from "@/lib/format";
import { fmtPrice } from "@/lib/market-data/bars";
import { db } from "@/lib/supabase";
import { getViewer, type Viewer } from "@/lib/auth";
import { authClient } from "@/lib/supabase/server";
import { getStructureEvents } from "./events-server";
import { eventSentence, isImproving, viridiaChanges, type ChangeGroup, type EventType, type StructureEvent } from "./events";
import { entryText } from "./setups";
import { SETUP_LABEL } from "./candidates";
import { SIGNAL_CARDS, getMarketContext, type MarketContext } from "./mission-server";
import { PULSE_GROUPS, REGIME_LABEL, closeLabel, fmtPct, regime, returns, waveShort, whatChanged, type DaySection, type FeedItem, type Regime } from "./mission";
import { parseHoldings, type Context } from "@/lib/portfolio/xray";
import { portfolioIntel, type PortfolioIntel } from "@/lib/portfolio/intel";

export interface WatchRow {
  symbol: string; name: string; close: number | null; change_pct: number | null; trend: string | null; swing: string | null;
  pattern: string | null; complete: boolean | null; wave: string | null; wave_dir: string | null; score: number | null;
  zone_low: number | null; zone_high: number | null; event_type: EventType | null; event_day: string | null; event_detail: Record<string, unknown> | null;
}

export interface Attention { id: string; label: string; value: string; detail: string; href: string; tone?: "pos" | "neg" }
export interface SavedSummary { id: string; name: string; updated_at: string; reviewed_at: string | null }

export interface MissionData {
  viewer: Viewer | null; ok: boolean; ctx: MarketContext;
  lastTs: string | null; since: string; reg: Regime; title: string;
  changes: ChangeGroup[]; changeDay: string | null; context: FeedItem[];
  watch: WatchRow[]; saved: SavedSummary[];
  portfolio: { id: string; name: string; intel: PortfolioIntel } | null;
  attention: Attention[]; day: DaySection[];
  improving: { symbol: string; text: string }[];
  watchLines: { symbol: string; text: string }[] | null;
  setupLines: { symbol: string; text: string }[];
}

export async function loadMission(): Promise<MissionData> {
  const viewer = await getViewer().catch(() => null);
  const sb = viewer ? await authClient() : null;
  const [{ ctx, ok }, watchRes, savedRes] = await Promise.all([
    getMarketContext(),
    sb ? sb.rpc("my_watchlist") : Promise.resolve({ data: [] }),
    sb ? sb.from("portfolios").select("id, name, holdings_text, updated_at, reviewed_at").order("updated_at", { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
  ]);
  const watch = dedupe((watchRes.data ?? []) as WatchRow[]);
  const savedRows = (savedRes.data ?? []) as (SavedSummary & { holdings_text: string })[];
  const saved = savedRows.map(({ id, name, updated_at, reviewed_at }) => ({ id, name, updated_at, reviewed_at }));

  // the most recently updated saved portfolio, measured with stored data
  const latest = savedRows[0];
  const holdings = latest ? parseHoldings(latest.holdings_text ?? "").holdings : [];
  const symbols = [...new Set([...watch.map((w) => w.symbol), ...holdings.map((h) => h.symbol)])];
  const [ownEvents, pfCtx] = await Promise.all([
    symbols.length ? getStructureEvents({ symbols, days: 1, limit: 200 }).catch(() => [] as StructureEvent[]) : Promise.resolve([] as StructureEvent[]),
    holdings.length ? db().rpc("portfolio_context", { p_symbols: holdings.map((h) => h.symbol) }).then((r) => (r.data ?? []) as Context[], () => [] as Context[]) : Promise.resolve([] as Context[]),
  ]);
  const portfolio = latest && holdings.length ? { id: latest.id, name: latest.name, intel: portfolioIntel(holdings, pfCtx, ownEvents) } : null;

  const { pulse, breadth } = ctx;
  const spy = pulse.find((r) => r.symbol === "SPY") ?? null;
  const lastTs = spy?.last_ts ?? pulse[0]?.last_ts ?? null;
  const since = closeLabel(lastTs);
  const reg = regime(breadth, spy);
  const watched = new Set(watch.map((w) => w.symbol));

  const changes = viridiaChanges([...ownEvents.filter((e) => watched.has(e.symbol)), ...ctx.changeEvents], ctx.eventCounts, watched);
  const changeDay = ctx.eventCounts[0]?.day ?? ctx.changeEvents[0]?.day ?? null;
  const context = whatChanged({ pulse, breadth, market: [], watchlist: [], gainer: ctx.gainer, loser: ctx.loser });

  const watchEvents = watch.filter((w) => w.event_type && w.event_day && lastTs && w.event_day >= lastTs.slice(0, 10));
  const watchLines = viewer ? watchEvents.map((w) => ({ symbol: w.symbol, text: eventSentence({ type: w.event_type!, detail: w.event_detail ?? {} }) })) : null;
  const improving = ctx.changeEvents.filter((e) => isImproving(e)).slice(0, 8).map((e) => ({ symbol: e.symbol, text: eventSentence(e) }));
  const setupLines = ctx.setups.map((r) => ({
    symbol: r.symbol,
    text: `${r.side === "buy" ? "Bullish" : "Bearish"} · ${SETUP_LABEL[r.kind] ?? r.kind}${r.status === "waiting" ? " (waiting)" : ""} · reference ${r.setup ? entryText(r.setup) : "—"}, invalidation ${r.setup ? fmtPrice(r.setup.stop.price) : "—"}, structural target ${r.setup ? fmtPrice(r.setup.target.price) : "—"} · ${r.rr.toFixed(1)} : 1`,
  }));

  // attention summary
  const spyR = spy ? returns(spy) : null;
  const totalEvents = ctx.eventCounts.reduce((a, c) => a + c.n, 0);
  const sig = (id: string) => ctx.signalCounts.find((s) => s.signal === id);
  const nearInv = sig("near_invalidation");
  const attention: Attention[] = [
    { id: "market", label: "Market", value: spyR ? `S&P 500 ${fmtPct(spyR.d1, 2)}` : "—", detail: `${REGIME_LABEL[reg.id]}${breadth && (breadth.advancers || breadth.decliners) ? ` · ${fmtInt(breadth.advancers)} advancers, ${fmtInt(breadth.decliners)} decliners` : ""}`, href: "/markets", tone: spyR?.d1 == null ? undefined : spyR.d1 >= 0 ? "pos" : "neg" },
    { id: "structure", label: "Structural changes", value: totalEvents ? fmtInt(totalEvents) : "—", detail: totalEvents ? `${changes.length} kinds of change on liquid names` : "Compared once two sessions are analysed", href: "#changes" },
    { id: "invalidation", label: "Near invalidation", value: nearInv ? fmtInt(nearInv.n_today) : "—", detail: "Within 3% of the level that breaks the count", href: SIGNAL_CARDS.find((c) => c.id === "near_invalidation")!.href },
  ];
  if (viewer) {
    attention.push({ id: "watchlist", label: "Watchlist", value: watch.length ? fmtInt(watchEvents.length) : "—", detail: watch.length ? `development${watchEvents.length === 1 ? "" : "s"} across ${watch.length} name${watch.length === 1 ? "" : "s"}` : "Add names from any security page", href: "/watchlist" });
  }
  if (portfolio) {
    const p = portfolio.intel;
    attention.push({ id: "portfolio", label: "Portfolio", value: p.dayPct != null ? fmtPct(p.dayPct, 2) : fmtInt(p.holdings), detail: `${p.structural.length} structural change${p.structural.length === 1 ? "" : "s"}, ${p.nearInvalidation.length} near invalidation`, href: `/portfolio?id=${portfolio.id}`, tone: p.dayPct == null ? undefined : p.dayPct >= 0 ? "pos" : "neg" });
  }

  const by = new Map(pulse.map((r) => [r.symbol, r]));
  const day: DaySection[] = [
    { heading: `Markets through ${since}`, lines: PULSE_GROUPS.map((g) => `${g.label}${g.id === "rates" ? " (ETF prices, not yields)" : ""}: ${g.items.map((it) => {
      const r = by.get(it.symbol);
      return r ? `${it.label} ${fmtPct(returns(r).d1)} day, ${fmtPct(returns(r).w1)} week` : null;
    }).filter(Boolean).join("; ")}.`) },
    { heading: "Regime", lines: [reg.sentence] },
    { heading: "Viridia changes", lines: changes.length
      ? changes.map((g) => `${g.label}: ${fmtInt(g.n)} liquid name${g.n === 1 ? "" : "s"}${g.examples.length ? ` (e.g. ${g.examples.map((e) => `${e.symbol}: ${e.text}`).join(" ")})` : ""}`)
      : ["Structural changes are compared once two sessions have been analysed."] },
    { heading: "Viridia signals", lines: SIGNAL_CARDS.map((c) => {
      const s = sig(c.id);
      return `${c.label}: ${s ? fmtInt(s.n_today) : "—"}${s?.new_today != null ? `, ${fmtInt(s.new_today)} new` : ""}${s?.n_prior != null ? `, ${delta(s.n_today - s.n_prior)} vs prior session` : ""}.`;
    }) },
    { heading: "Market context", lines: context.map((f) => f.text) },
    ...(viewer ? [{ heading: "Watchlist", lines: watch.map((w) => {
      const wave = waveShort(w.pattern, w.complete, w.wave, w.wave_dir);
      const ev = w.event_type ? eventSentence({ type: w.event_type, detail: w.event_detail ?? {} }) : null;
      return `${w.symbol} ${fmtPrice(w.close)} (${fmtPct(w.change_pct)})${wave ? ` · ${wave}` : ""}${ev ? ` · ${ev}` : ""}`;
    }) }] : []),
    ...(portfolio ? [{ heading: `Portfolio: ${portfolio.name}`, lines: portfolioLines(portfolio.intel) }] : []),
    { heading: "Setups to review", lines: setupLines.map((l) => `${l.symbol}: ${l.text}`) },
  ];

  const name = viewer?.firstName ? `, ${viewer.firstName}` : "";
  return {
    viewer, ok, ctx, lastTs, since, reg, title: `${greeting().replace(/\.$/, "")}${name}.`,
    changes, changeDay, context, watch, saved, portfolio, attention,
    day, improving, watchLines, setupLines,
  };
}

export const briefTitle = () =>
  `Prepare my day · ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" })}`;

const delta = (n: number) => (n > 0 ? `+${fmtInt(n)}` : n < 0 ? `−${fmtInt(-n)}` : "no change");
const usd = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function portfolioLines(p: PortfolioIntel): string[] {
  const out = [`${p.holdings} holding${p.holdings === 1 ? "" : "s"}${p.priced < p.holdings ? ` (${p.priced} priced)` : ""}, value ${usd(p.value)}${p.dayMove != null ? `, ${usd(p.dayMove)} (${fmtPct(p.dayPct, 2)}) on the day` : ""}.`];
  if (p.largest) out.push(`Largest exposure: ${p.largest.symbol} at ${(p.largest.weight * 100).toFixed(1)}%.`);
  if (p.contributor || p.detractor) out.push([p.contributor && `Largest contributor ${p.contributor.symbol} ${usd(p.contributor.amount)}`, p.detractor && `largest detractor ${p.detractor.symbol} ${usd(p.detractor.amount)}`].filter(Boolean).join("; ") + ".");
  out.push(p.structural.length ? `Structural changes: ${p.structural.map((s) => `${s.symbol}: ${eventSentence(s)}`).join(" ")}` : "No structural changes in holdings this session.");
  if (p.nearInvalidation.length) out.push(`Near invalidation: ${p.nearInvalidation.join(", ")}.`);
  if (p.fibEvents.length) out.push(`Fib-zone events: ${p.fibEvents.join(", ")}.`);
  return out;
}

function dedupe(rows: WatchRow[]) {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.symbol) ? false : (seen.add(r.symbol), true)));
}

