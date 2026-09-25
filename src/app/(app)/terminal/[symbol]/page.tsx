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
import { getDailyAnalysis } from "@/lib/analysis/server";
import { WaveCounts } from "@/components/WaveCounts";
import { ConfluenceZones } from "@/components/ConfluenceZones";

type Props = { params: Promise<{ symbol: string }> };

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

const TABS: { label: string; live: boolean }[] = [
  { label: "Overview", live: true }, { label: "Structure", live: false }, { label: "Financials", live: false },
  { label: "Earnings", live: false }, { label: "Filings", live: true }, { label: "Ownership", live: false }, { label: "AI Research", live: false },
];

export default async function StockTerminal({ params }: Props) {
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

  const [events, mappings, summaryRes, snapRes, swings] = await Promise.all([
    db().from("security_events").select("*").eq("security_id", sec.id).order("id", { ascending: false }).limit(20),
    db().from("security_provider_symbols").select("provider, provider_symbol, valid_from").eq("security_id", sec.id),
    db().rpc("get_bar_summary", { p_symbol: sec.symbol }),
    db().rpc("get_snapshot", { p_symbol: sec.symbol }),
    getDailyAnalysis(sec.symbol).catch(() => null),
  ]);
  const sum = (summaryRes.data ?? null) as BarSummary | null;
  const snap = (snapRes.data ?? null) as Snapshot | null;
  const evts = (events.data ?? []) as SecurityEvent[];
  const hasPrice = sum?.last_close != null;
  const chg = hasPrice && sum!.prev_close ? sum!.last_close! - sum!.prev_close : null;
  const chgPct = chg != null && sum!.prev_close ? chg / sum!.prev_close : null;
  const edgar = sec.cik ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${sec.cik}&type=&dateb=&owner=include&count=40` : null;
  const stored = (mappings.data ?? []) as { provider: string; provider_symbol: string; valid_from: string }[];
  const providerRows = [
    ...stored.map((m) => ({ provider: m.provider, symbol: m.provider_symbol })),
    ...(["massive"] as const).filter((p) => !stored.some((m) => m.provider === p)).map((p) => ({ provider: p, symbol: toProviderSymbol(sec.symbol, p) })),
  ];
  const coverage = sum?.coverage === "full" ? "Automatic, updated nightly" : sum?.coverage === "on_demand" ? "On demand, then updated nightly" : "Fetched when first opened";

  return (
    <>
      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-3">
              <h1 className="text-[34px] font-[650] leading-none tracking-[-0.035em]">{sec.symbol}</h1>
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
            <button className="btn" disabled title="Watchlists arrive with accounts">Watch</button>
            <button className="btn" disabled title="Alerts arrive with accounts">Alert</button>
            <button className="btn" disabled title="Comparison is planned">Compare</button>
            <AskViridiaButton symbol={sec.symbol} />
          </div>
        </div>
        <nav className="-mb-2 flex gap-6 overflow-x-auto border-b border-line" aria-label="Security sections">
          {TABS.map((t) => {
            if (t.label === "Filings" && edgar)
              return <a key={t.label} href={edgar} target="_blank" rel="noreferrer" className="whitespace-nowrap border-b-2 border-transparent pb-3 text-[14px] font-[550] text-fg-2 hover:text-fg">Filings ↗</a>;
            return (
              <span
                key={t.label} aria-current={t.label === "Overview" ? "page" : undefined}
                title={t.live ? undefined : "Planned"}
                className={`whitespace-nowrap border-b-2 pb-3 text-[14px] font-[550] ${t.label === "Overview" ? "border-brand text-fg" : "cursor-default border-transparent text-fg-3"}`}
              >
                {t.label}
              </span>
            );
          })}
        </nav>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <PriceChart symbol={sec.symbol} zones={swings?.fib?.zones ?? []} />
        <StructureSummary snap={snap} swings={swings} />
      </div>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <WaveCounts data={swings?.candidates ?? null} asOf={swings?.asOf} version={swings?.version} source={swings?.source} />
        <div className="flex min-w-0 flex-col gap-6">
        <ConfluenceZones fib={swings?.fib ?? null} />
        <div className="card">
          <div className="card-h"><h2 className="card-t">Details</h2></div>
          <dl className="kv px-5 py-5">
            <dt>Price history</dt><dd>{coverage}</dd>
            <dt>Daily bars</dt><dd className="num">{sum?.bars_1d ? `${sum.bars_1d.toLocaleString("en-US")} since ${fmtDate(sum.first_ts)}` : "—"}</dd>
            <dt>Avg volume, 50 days</dt><dd className="num">{fmtVolume(sum?.avg_volume_50d)}</dd>
            <dt>Dollar volume, 20 days</dt><dd className="num">{fmtDollars(snap?.adv20)}</dd>
            <dt>SEC CIK</dt><dd className="num">{sec.cik ?? "Not matched"}</dd>
            <dt>Provider symbols</dt><dd className="num">{providerRows.map((r) => `${r.provider}: ${r.symbol}`).join(" · ")}</dd>
            <dt>Listing changes</dt><dd>{evts.length ? `${evts.length} recorded` : `None since ${fmtDate(sec.first_seen_at)}`}</dd>
          </dl>
          <SourceFooter source="Nasdaq Trader, SEC, Massive" updated={fmtDateTime(sec.last_seen_at)} method="Security master, daily snapshot diff" />
        </div>
        </div>
      </section>
    </>
  );
}
