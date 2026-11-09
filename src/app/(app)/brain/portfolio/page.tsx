import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { DrawerProvider, TickerButton } from "@/components/mission/SecurityDrawer";
import { getViewer } from "@/lib/auth";
import { authClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/timeout";
import { fmtPrice } from "@/lib/market-data/bars";
import { SIGNAL_TONE } from "@/lib/brain/signal";
import { RULES, type Change, type DailyList, type Pick } from "@/lib/brain/portfolio";

export const metadata: Metadata = { title: "Daily buy list" };
export const dynamic = "force-dynamic";

const pc = (x: number) => `${(x * 100).toFixed(1)}%`;
const sc = (x: number | null) => (x == null ? "—" : `${x > 0 ? "+" : ""}${x.toFixed(2)}`);
const tone = (x: number | null) => (x == null ? "text-fg-3" : x > 0.1 ? "text-pos" : x < -0.1 ? "text-neg" : "text-fg-2");
const fmtDay = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const KIND: Record<Change["kind"], [string, string]> = { new: ["New", "var(--pos)"], add: ["Add", "var(--pos)"], trim: ["Trim", "var(--neg)"], drop: ["Drop", "var(--neg)"] };

function Holdings({ title, rows }: { title: string; rows: Pick[] }) {
  return (
    <section className="card overflow-hidden" aria-label={title}>
      <header className="flex items-baseline gap-2 border-b border-line px-4 py-3">
        <h2 className="card-t">{title}</h2>
        <span className="num text-[12px] text-fg-3">{rows.length} · {pc(rows.reduce((a, p) => a + p.weight, 0))}</span>
      </header>
      {rows.length === 0 ? <p className="px-4 py-4 text-[13px] text-fg-3">None qualify today.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead className="text-left text-[11.5px] text-fg-3">
              <tr><th className="px-4 py-2 font-medium">Name</th><th className="px-2 py-2 text-right font-medium">Target</th><th className="px-2 py-2 font-medium">Signal</th><th className="px-2 py-2 text-right font-medium">Theses</th><th className="px-2 py-2 text-right font-medium">Value</th><th className="px-2 py-2 text-right font-medium">Technicals</th><th className="px-2 py-2 text-right font-medium">Last</th><th className="px-4 py-2 text-right font-medium">Invalidation</th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.symbol} className="border-t border-line align-top">
                  <td className="px-4 py-2.5">
                    <span className="flex items-baseline gap-2"><TickerButton symbol={p.symbol} className="tk hover:text-brand" /><span className="truncate text-[12.5px] text-fg-2">{p.name}</span>{p.conflict && <span className="text-[11px] font-medium" style={{ color: "var(--warn)" }}>conflict</span>}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-fg-3">{p.why.slice(0, 3).join(" · ")}</span>
                  </td>
                  <td className="num px-2 py-2.5 text-right font-medium">{pc(p.weight)}</td>
                  <td className="px-2 py-2.5 font-[650]" style={{ color: SIGNAL_TONE[p.label] }}>{p.label} <span className="num font-normal text-fg-3">{sc(p.score)}</span></td>
                  <td className={`num px-2 py-2.5 text-right ${tone(p.thesis)}`}>{sc(p.thesis)}</td>
                  <td className={`num px-2 py-2.5 text-right ${tone(p.value)}`}>{sc(p.value)}</td>
                  <td className={`num px-2 py-2.5 text-right ${tone(p.technical)}`}>{sc(p.technical)}</td>
                  <td className="num px-2 py-2.5 text-right">{p.close != null ? fmtPrice(p.close) : "—"}</td>
                  <td className="num px-4 py-2.5 text-right text-fg-2">{p.invalidation != null ? fmtPrice(p.invalidation) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** The latest daily model portfolio built from the reader's Brain. A list to review, never an order. */
export default async function BrainPortfolioPage() {
  const viewer = await withTimeout(getViewer(), 4_000, "viewer").catch(() => null);
  if (!viewer) redirect("/signin?next=/brain/portfolio");
  const sb = await authClient();
  const { data } = await withTimeout(sb.from("brain_daily_lists").select("run_date, generated_at, payload").order("run_date", { ascending: false }).limit(1), 6_000)
    .catch(() => ({ data: null }));
  const d = (data?.[0]?.payload ?? null) as DailyList | null;

  return (
    <DrawerProvider>
      <PageHeader
        title={<>Daily <em>buy list</em></>}
        description="A model portfolio rebuilt every weekday morning from your theses, your screens and company fundamentals. It is a list for you to check by hand. Nothing is bought."
        actions={<Link href="/brain" className="btn">Back to your brain</Link>}
      />
      {!d ? (
        <section className="card p-5 text-[13.5px] text-fg-2">The first list is built at 6:30 AM ET on the next weekday and emailed at 8:30 AM.</section>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-[13px] text-fg-2">{fmtDay(d.date)} · {d.universe} securities scored · {d.stocks.length} stocks, {d.etfs.length} ETFs, {pc(d.cash)} cash{!d.valueLive && " · SEC fundamentals still loading, so stock picks rest on theses and technicals"}</p>

          <section className="card p-4" aria-label="Changes today">
            <h2 className="card-t">To review today</h2>
            {d.changes.length === 0 ? <p className="mt-2 text-[13px] text-fg-3">No changes from the previous list.</p> : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {d.changes.map((c) => (
                  <li key={c.symbol} className="rounded-md border border-line px-2.5 py-1.5 text-[12.5px]">
                    <span className="font-[650]" style={{ color: KIND[c.kind][1] }}>{KIND[c.kind][0]}</span> <span className="tk">{c.symbol}</span> <span className="num text-fg-3">{c.kind === "new" ? pc(c.to) : c.kind === "drop" ? `from ${pc(c.from)}` : `${pc(c.from)} → ${pc(c.to)}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Holdings title="Stocks" rows={d.stocks} />
          <Holdings title="ETFs" rows={d.etfs} />

          {d.avoid.length > 0 && (
            <section className="card p-4" aria-label="Avoid">
              <h2 className="card-t">Avoid</h2>
              <ul className="mt-2 grid gap-1 text-[12.5px] sm:grid-cols-2">
                {d.avoid.map((a) => <li key={a.symbol}><TickerButton symbol={a.symbol} className="tk hover:text-brand" /> <span className="font-medium" style={{ color: SIGNAL_TONE[a.label] }}>{a.label}</span> <span className="text-fg-3">{a.why}</span></li>)}
              </ul>
            </section>
          )}

          <p className="text-[12px] leading-relaxed text-fg-3">
            Rules: equal thirds of your theses, value and technicals. Buy or Accumulate signals only. A stock needs your theses not against it and support from a thesis or its fundamentals; an ETF needs a supportive thesis. Sized by signal strength, at most {pc(RULES.maxStockWeight)} per stock, {pc(RULES.maxEtfWeight)} per ETF and {pc(RULES.maxSectorWeight)} per sector, with {pc(RULES.stockSleeve)} in stocks when both have names. Leveraged and inverse products are left out. Research output, not investment advice.
          </p>
        </div>
      )}
    </DrawerProvider>
  );
}
