import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { DrawerProvider, TickerButton } from "@/components/mission/SecurityDrawer";
import { Icon } from "@/components/Icon";
import { brainSignals, getBrain } from "@/lib/brain/server";
import { SIGNAL_TONE, thesisWeight, type BrainSignal, type Component, type Thesis } from "@/lib/brain/signal";
import { fmtPrice } from "@/lib/market-data/bars";

export const metadata: Metadata = { title: "Brain" };
export const dynamic = "force-dynamic";

const fmtDate = (iso: string | null) => (iso ? new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—");
const STANCE = { bullish: ["Bullish", "var(--pos)"], bearish: ["Bearish", "var(--neg)"], neutral: ["Neutral", "var(--text-2)"] } as const;
const HORIZON = { weeks: "Weeks", months: "Months", year: "About a year", "multi-year": "Multi-year" } as const;

function Score({ c, label }: { c: Component | null; label: string }) {
  if (!c) return <span className="text-fg-3" title={`No ${label.toLowerCase()} input`}>—</span>;
  const tone = c.score > 0.1 ? "text-pos" : c.score < -0.1 ? "text-neg" : "text-fg-2";
  return <span className={`num font-medium ${tone}`} title={c.reasons.join("\n")}>{c.score > 0 ? "+" : ""}{c.score.toFixed(2)}</span>;
}

function Meter({ v }: { v: number }) {
  return (
    <span className="relative block h-1.5 w-full rounded-full bg-hover" aria-hidden>
      <span className="absolute inset-y-0 left-1/2 w-px bg-line-2" />
      <span className="absolute inset-y-0 rounded-full" style={v >= 0
        ? { left: "50%", width: `${v * 50}%`, background: "var(--pos-chart)" }
        : { right: "50%", width: `${-v * 50}%`, background: "var(--neg)" }} />
    </span>
  );
}

function SignalRow({ s }: { s: BrainSignal & { row: { name: string | null; close: number | null; last_ts: string | null } } }) {
  const parts: [string, Component | null][] = [["Your theses", s.thesis], ["Value", s.value], ["Technicals", s.technical]];
  return (
    <details className="group border-b border-line last:border-b-0">
      <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_88px] items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-hover md:grid-cols-[minmax(0,1.6fr)_96px_minmax(0,1fr)_64px_64px_64px_20px] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="flex items-baseline gap-2">
            <TickerButton symbol={s.symbol} className="tk text-[13.5px] hover:text-brand" />
            <span className="truncate text-[12.5px] text-fg-2">{s.row.name}</span>
            {s.conflict && <span className="text-[11px] font-medium" style={{ color: "var(--warn)" }}>conflict</span>}
          </span>
          <span className="num text-[11.5px] text-fg-3">{s.row.close != null ? fmtPrice(s.row.close) : "—"} · close {fmtDate(s.row.last_ts)}</span>
        </span>
        <span className="text-right text-[13px] font-[650] md:text-left" style={{ color: SIGNAL_TONE[s.label] }}>{s.label}</span>
        <span className="col-span-2 flex items-center gap-2 md:col-span-1"><Meter v={s.score} /><span className="num w-10 text-right text-[12px] text-fg-2">{s.score > 0 ? "+" : ""}{s.score.toFixed(2)}</span></span>
        <span className="hidden text-center text-[12.5px] md:block"><Score c={s.thesis} label="Thesis" /></span>
        <span className="hidden text-center text-[12.5px] md:block"><Score c={s.value} label="Value" /></span>
        <span className="hidden text-center text-[12.5px] md:block"><Score c={s.technical} label="Technical" /></span>
        <Icon name="chevronRight" className="hidden h-[13px] w-[13px] text-fg-3 transition-transform group-open:rotate-90 md:block" />
      </summary>
      <div className="grid gap-3 bg-panel-2 px-4 py-3 md:grid-cols-3">
        {parts.map(([label, c]) => (
          <div key={label}>
            <p className="flex items-baseline gap-2 text-[12px] font-medium text-fg-3">{label} <Score c={c} label={label} /></p>
            {c ? (
              <ul className="mt-1 flex flex-col gap-0.5 text-[12.5px] leading-snug text-fg-2">{c.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            ) : (
              <p className="mt-1 text-[12.5px] text-fg-3">
                {label === "Value" ? (s.row.close != null && s.value == null ? "No value score: ETFs have none, and company fundamentals aren't loaded yet." : "—") : label === "Your theses" ? "No thesis touches this security." : "No price data."}
              </p>
            )}
          </div>
        ))}
        <p className="text-[12px] text-fg-3 md:col-span-3">
          <Link href={`/terminal/${s.symbol}`} className="text-brand hover:underline">Open {s.symbol} research</Link> · equal thirds over {s.components} of 3 inputs{s.components < 2 ? "; one input alone can't make a Buy or Sell" : ""}.
        </p>
      </div>
    </details>
  );
}

function ThesisCard({ t }: { t: Thesis }) {
  const [label, color] = STANCE[t.stance];
  const w = thesisWeight(t);
  return (
    <article className="card flex flex-col gap-2.5 p-4" id={`t-${t.id}`}>
      <header className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-[650]" style={{ color }}>{label}</span>
        <span className="flex gap-0.5" aria-label={`Conviction ${t.conviction} of 5`} title={`Conviction ${t.conviction} of 5`}>
          {[1, 2, 3, 4, 5].map((i) => <span key={i} className="h-1.5 w-3 rounded-sm" style={{ background: i <= t.conviction ? color : "var(--hover)" }} />)}
        </span>
        <span className="text-[12px] text-fg-3">{HORIZON[t.horizon]} · {t.style}</span>
        {t.status !== "active" && <span className="chip">{t.status}</span>}
        {w > 0 && w < t.conviction / 5 && t.status === "active" && <span className="text-[11.5px] text-fg-3">fading past its horizon</span>}
      </header>
      <h3 className="text-[15px] font-[620] leading-snug">{t.title}</h3>
      <p className="text-[13px] leading-relaxed text-fg-2">{t.thesis}</p>
      {t.invalidation && <p className="text-[12.5px] leading-snug" style={{ color: "var(--neg)" }}><span className="font-medium">Wrong if:</span> {t.invalidation}</p>}
      <div className="flex flex-wrap gap-1.5">
        {t.links.map((l) => {
          const st = l.stance ?? t.stance;
          return l.kind === "symbol"
            ? <TickerButton key={l.value} symbol={l.value} className={`chip tk hover:border-line-2 ${st === "bearish" ? "text-neg" : st === "bullish" ? "text-pos" : ""}`} />
            : <span key={l.value} className={`chip ${st === "bearish" ? "text-neg" : st === "bullish" ? "text-pos" : ""}`}>{l.value} sector</span>;
        })}
      </div>
      <footer className="text-[11.5px] text-fg-3">{t.source ? `${t.source.title}${t.source.publisher ? ` · ${t.source.publisher}` : ""}${t.source.published_on ? ` · ${fmtDate(t.source.published_on)}` : ""}` : "Your note"} · filed {fmtDate(t.created_at)}</footer>
    </article>
  );
}

/**
 * Brain: the reader's investment theses, filed from what they share, and the research signals they
 * drive. Each signal is equal thirds of thesis alignment, value and technicals, with every reason shown.
 * Private: row-level security limits every row to its owner.
 */
export default async function BrainPage() {
  const brain = await getBrain();
  if (!brain.signedIn) redirect("/signin?next=/brain");
  const live = brain.theses.filter((t) => t.status === "active" || t.status === "watching");
  const past = brain.theses.filter((t) => t.status === "retired" || t.status === "invalidated");
  const { signals, valueLive } = await brainSignals(live).catch(() => ({ signals: [], valueLive: false }));
  const conflicts = signals.filter((s) => s.conflict).length;
  const stats: [string, number][] = [["Active theses", live.filter((t) => t.status === "active").length], ["Watching", live.filter((t) => t.status === "watching").length], ["Sources", brain.sources.length], ["Securities touched", signals.length], ["Conflicts", conflicts]];

  return (
    <DrawerProvider>
      <PageHeader
        title={<>Your <em>brain</em></>}
        description="Everything you've shared, filed as theses with a stance, conviction, horizon and the level that would prove it wrong, and turned into research signals for the stocks and ETFs they touch. Private to your account."
      />

      <section className="card grid grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-5" aria-label="Summary">
        {stats.map(([k, v]) => (
          <div key={k} className="bg-panel px-4 py-3">
            <p className="text-[12px] text-fg-3">{k}</p>
            <p className="num text-[20px] font-[640] tracking-[-0.02em]" style={k === "Conflicts" && v > 0 ? { color: "var(--warn)" } : undefined}>{v}</p>
          </div>
        ))}
      </section>

      <section className="card overflow-hidden" aria-labelledby="sig-t">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-3">
          <h2 id="sig-t" className="card-t">Signals</h2>
          <span className="text-[12px] text-fg-3">Equal thirds: your theses, value, technicals · strongest first · open a row for the reasons</span>
        </header>
        {signals.length ? (
          <>
            <div className="hidden grid-cols-[minmax(0,1.6fr)_96px_minmax(0,1fr)_64px_64px_64px_20px] gap-x-3 border-b border-line bg-panel-2 px-4 py-1.5 text-[11.5px] text-fg-3 md:grid">
              <span>Security</span><span>Signal</span><span>Score (−1 to +1)</span><span className="text-center">Theses</span><span className="text-center">Value</span><span className="text-center">Technical</span><span />
            </div>
            {signals.map((s) => <SignalRow key={s.symbol} s={s} />)}
          </>
        ) : (
          <p className="px-4 py-6 text-[13px] leading-relaxed text-fg-2">
            No signals yet. Share a newsletter, report, company deck or your own note with Viridia in chat; each idea is filed here as a thesis linked to the stocks, ETFs or sectors it bears on, and signals appear for every one of them.
          </p>
        )}
        <p className="border-t border-line px-4 py-2.5 text-[11.5px] leading-relaxed text-fg-3">
          {valueLive ? "Value compares earnings, sales and cash flow with sector peers from SEC filings." : "The value third is off until company fundamentals from SEC filings are loaded; until then signals use your theses and technicals."} Prices are end-of-day closes. Research signals, not investment advice.
        </p>
      </section>

      {live.length > 0 && (
        <section aria-labelledby="th-t" className="flex flex-col gap-3">
          <h2 id="th-t" className="serif text-[26px] leading-none">Theses</h2>
          <div className="grid gap-3 lg:grid-cols-2">{live.map((t) => <ThesisCard key={t.id} t={t} />)}</div>
        </section>
      )}

      {past.length > 0 && (
        <details className="card group overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 hover:bg-hover [&::-webkit-details-marker]:hidden">
            <Icon name="chevronRight" className="h-[13px] w-[13px] text-fg-3 transition-transform group-open:rotate-90" />
            <span className="card-t">Retired and invalidated</span><span className="text-[12px] text-fg-3">{past.length}</span>
          </summary>
          <div className="grid gap-3 border-t border-line p-3 lg:grid-cols-2">{past.map((t) => <ThesisCard key={t.id} t={t} />)}</div>
        </details>
      )}

      {brain.sources.length > 0 && (
        <section className="card overflow-hidden" aria-labelledby="src-t">
          <header className="border-b border-line px-4 py-3"><h2 id="src-t" className="card-t">Sources</h2></header>
          <ul className="divide-y divide-line">
            {brain.sources.map((s) => (
              <li key={s.id} className="px-4 py-2.5">
                <p className="text-[13.5px]"><span className="font-[600]">{s.title}</span>{s.publisher ? <span className="text-fg-2"> · {s.publisher}</span> : null}<span className="text-fg-3"> · {fmtDate(s.published_on ?? s.created_at)} · {s.kind}</span></p>
                {s.summary && <p className="mt-0.5 text-[12.5px] leading-snug text-fg-2">{s.summary}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </DrawerProvider>
  );
}
