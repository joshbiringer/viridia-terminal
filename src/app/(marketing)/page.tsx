import Link from "next/link";
import type { Metadata } from "next";
import { ViridiaLockup, ViridiaMark } from "@/components/ViridiaMark";
import { HeroTerminalMock } from "@/components/marketing/HeroTerminalMock";
import { IllustrativeChart } from "@/components/marketing/IllustrativeChart";
import { WaveSchematic } from "@/components/marketing/WaveSchematic";
import { FibSchematic } from "@/components/marketing/FibSchematic";
import { ScannerTable } from "@/components/ScannerTable";
import { EXAMPLE } from "@/lib/illustration";
import { scan, type ScanRow } from "@/lib/market-data/snapshot";
import { fmtDate } from "@/lib/format";
import { TrackEvent } from "@/components/TrackEvent";

export const metadata: Metadata = {
  title: { absolute: "Viridia: From market signal to client conversation" },
  description: "The research and intelligence terminal for advisors, RIAs and portfolio managers: market structure, portfolio X-ray and client-ready explanations in one place.",
};
export const revalidate = 900;

const NAV = [["Product", "#product"], ["Portfolio X-Ray", "/portfolio"], ["Markets", "/markets"], ["Methodology", "#methodology"], ["Pricing", "#pricing"]];

export default async function Landing() {
  let live: ScanRow[] = [];
  try { live = await scan({ p_sort: "dollar_volume", p_limit: 8 }); } catch { live = []; }

  return (
    <div className="bg-panel">
      <TrackEvent event="landing_view" />
      {/* ------------------------------------------------ nav */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-panel/90 backdrop-blur-[3px]">
        <div className="mx-auto flex h-[64px] max-w-[1200px] items-center gap-8 px-6">
          <Link href="/" aria-label="Viridia home"><ViridiaLockup /></Link>
          <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
            {NAV.map(([l, h]) => <Link key={l} href={h} className="text-[14px] font-[550] text-fg-2 transition-colors hover:text-fg">{l}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/signin" className="hidden px-3 text-[14px] font-[550] text-fg-2 transition-colors hover:text-fg sm:inline">Sign in</Link>
            <Link href="/signup" className="btn pri">Start free</Link>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------ hero */}
      <section className="relative overflow-hidden" id="product">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[560px]" style={{ background: "radial-gradient(60% 55% at 70% 0%, var(--panel-2) 0%, transparent 70%)" }} />
        <div className="relative mx-auto max-w-[1200px] px-6 pb-20 pt-20 md:pt-28">
          <p className="eyebrow">For advisors, RIAs and portfolio managers</p>
          <h1 className="display mt-5 max-w-[900px]">From market signal<br />to client conversation.</h1>
          <p className="lede mt-6 max-w-[660px]">
            Viridia brings market structure, portfolio intelligence and client-ready explanations into one research terminal, so you can see what changed, understand why it matters and explain it clearly.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/signup" className="btn pri lg">Start free</Link>
            <Link href="/terminal" className="btn lg">Explore the Terminal</Link>
          </div>
          <p className="caption mt-4 text-[12.5px]">Free during the beta. No card required. The Terminal is open without an account.</p>
          <div className="mt-16 md:mt-20"><HeroTerminalMock /></div>
        </div>
      </section>

      {/* ------------------------------------------------ outcomes (live features only) */}
      <section className="border-t border-line">
        <div className="mx-auto grid max-w-[1200px] gap-px bg-line px-0 md:grid-cols-4">
          {([
            ["See what matters", "The Brief opens with what changed since the last session: wave structure flips, new and expired setups, the biggest moves, and your watchlist.", "/terminal", "Open the Brief"],
            ["Understand a portfolio", "Portfolio X-Ray measures concentration, beta, volatility, correlated positions, tax lots and each holding's structure. Nothing you paste is stored.", "/portfolio", "Try Portfolio X-Ray"],
            ["Context, not ratings", "Viridia Signals shows structure, trend, momentum and risk side by side, and every setup carries its historical track record.", "/setups/track-record", "See the track record"],
            ["Communicate better", "Every explanation has a client version: plain language, no jargon, the level that would change the view, ready to copy.", "/terminal/SPY", "See an example"],
          ] as const).map(([t, d, href, cta]) => (
            <div key={t} className="flex flex-col gap-2 bg-panel px-6 py-10">
              <h3 className="h3">{t}</h3>
              <p className="text-[14.5px] leading-relaxed text-fg-2">{d}</p>
              <Link href={href} className="mt-auto pt-2 text-[14px] font-medium text-brand hover:underline">{cta} →</Link>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ modules, with honest status */}
      <Section eyebrow="One platform" title={<>Research. Portfolios. Markets.<br />Clients. One terminal.</>}
        lede="Viridia is built in modules that share one intelligence layer. Here is exactly what is live today and what is being built.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ["Viridia Research", "live", "Every U.S.-listed security: rule-checked Elliott Wave counts, Fibonacci confluence, Signals and setups with a track record."],
            ["Viridia Markets", "live", "Market overview, breadth, a structure scanner and the daily Brief of what changed."],
            ["Viridia Portfolio", "partial", "Portfolio X-Ray is live. Saved portfolios, model portfolios, drift monitoring and attribution are in development."],
            ["Viridia AI", "partial", "Ask Viridia explains every analysis, with a client version. Natural-language search across a practice comes later."],
            ["Viridia Advisor", "planned", "Client households, meeting preparation and planning opportunities, connected to your CRM and custodian."],
            ["Viridia Enterprise", "planned", "Investment committee workspace, firm-wide monitoring, governance and integrations."],
          ] as const).map(([name, st, d]) => (
            <div key={name} className="rounded-[var(--r-lg)] border border-line px-5 py-5">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold">{name}</span>
                <span className={`chip ml-auto ${st === "live" ? "pos" : st === "partial" ? "acc" : ""}`}>{st === "live" ? "Live" : st === "partial" ? "Partly live" : "Planned"}</span>
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-fg-2">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------ 2. structure */}
      <Section id="methodology" eyebrow="Methodology" title={<>Markets move in structure.</>}
        lede="Viridia analyzes price structure across multiple timeframes to identify motive waves, corrective structures, Fibonacci relationships and objective invalidation levels.">
        <div className="grid items-center gap-12 lg:grid-cols-[1.25fr_1fr]">
          <div className="rounded-[var(--r-lg)] border border-line bg-bg px-4 py-6"><WaveSchematic className="h-auto w-full" /></div>
          <div className="flex flex-col gap-7">
            {[
              ["Rules are never bent", "Wave 2 never retraces more than all of wave 1. Wave 3 is never the shortest motive wave. In an impulse, wave 4 never enters wave 1's price territory. A count that breaks one is discarded, whatever else it has going for it."],
              ["Guidelines add weight", "Alternation, channels and typical Fibonacci ratios raise or lower a count's confidence. They never override a rule."],
              ["Every count has a limit", "Each interpretation carries the exact price that would invalidate it, so you always know where it stops being true."],
            ].map(([t, d]) => (
              <div key={t}>
                <h3 className="h3">{t}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-fg-2">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------ 3. counts */}
      <Section eyebrow="Preferred and alternate counts" title={<>One chart.<br />Multiple interpretations.</>}
        lede="Elliott Wave analysis can produce more than one structurally valid reading of the same chart. Viridia ranks them rather than pretending the uncertainty isn't there.">
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-[var(--r-lg)] border border-line px-3 py-4"><IllustrativeChart layers={["waves", "alternate"]} className="h-auto w-full" /></div>
          <div className="flex flex-col gap-4">
            <CountCard color="var(--wave)" name="Preferred count" score={EXAMPLE.confidence}
              text="Wave 3 of an impulse is underway from the wave 2 low." />
            <CountCard color="var(--alt)" name="Alternate count" score={EXAMPLE.altConfidence}
              text="The advance is wave C of a correction and ends near the Fibonacci zone." />
            <p className="text-[13px] leading-relaxed text-fg-3">
              Scores are pattern confidence: how well each count fits the rules, guidelines and Fibonacci evidence. They are not probabilities, and Viridia won&apos;t call them that until they&apos;re validated by out-of-sample backtesting.
            </p>
          </div>
        </div>
        <Illustrative />
      </Section>

      {/* ------------------------------------------------ 4. fibonacci */}
      <Section eyebrow="Fibonacci confluence" title={<>Where structure<br />meets mathematics.</>}
        lede="Fibonacci levels are anchored to the active wave count, never drawn across arbitrary highs and lows. Where independent measurements overlap, Viridia marks a zone instead of pretending one exact price is certain.">
        <div className="grid items-center gap-12 lg:grid-cols-[1.25fr_1fr]">
          <div className="rounded-[var(--r-lg)] border border-line bg-bg px-4 py-6"><FibSchematic className="h-auto w-full" /></div>
          <div className="rounded-[var(--r-lg)] border border-line px-7 py-7">
            <div className="label">Fibonacci confluence</div>
            <div className="num mt-2 text-[34px] font-[640] tracking-[-0.03em] text-fib">{EXAMPLE.zone.lo.toFixed(2)} – {EXAMPLE.zone.hi.toFixed(2)}</div>
            <p className="mt-1 text-[14px] text-fg-2">3 overlapping relationships</p>
            <ul className="mt-5 flex flex-col gap-2.5 text-[14px]">
              <li className="flex justify-between gap-4"><span>1.618 extension of wave 1</span><span className="num text-fg-3">{EXAMPLE.ext1618.toFixed(2)}</span></li>
              <li className="flex justify-between gap-4"><span>0.618 retracement, higher degree</span><span className="num text-fg-3">57.40</span></li>
              <li className="flex justify-between gap-4"><span>Prior structural resistance</span><span className="num text-fg-3">58.10</span></li>
            </ul>
            <div className="mt-6 flex items-baseline justify-between border-t border-line pt-4">
              <span className="text-[14px] text-fg-2">Confluence</span>
              <span className="num text-[20px] font-[620]">8.6 <span className="text-[14px] text-fg-3">/ 10</span></span>
            </div>
          </div>
        </div>
        <Illustrative />
      </Section>

      {/* ------------------------------------------------ 5. scanner (live data) */}
      <Section eyebrow="Scanner" title={<>Scan the market.<br />Not just a watchlist.</>}
        lede="Viridia covers every security listed on U.S. exchanges. The scanner below is live: the most actively traded names at the last close.">
        <div className="overflow-hidden rounded-[var(--r-lg)] border border-line" style={{ boxShadow: "var(--shadow-md)" }}>
          <div className="flex items-center gap-3 border-b border-line bg-bg px-5 py-3 text-[13px]">
            <span className="font-semibold">Most active</span>
            <span className="text-fg-3">{live[0] ? `Close ${fmtDate(live[0].last_ts)}` : "Loading"}</span>
            <Link href="/scanner" className="ml-auto font-medium text-brand hover:underline">Open the scanner</Link>
          </div>
          {live.length ? <ScannerTable rows={live} compact structure /> : <div className="px-6 py-10 text-center text-fg-2">Live data is temporarily unavailable.</div>}
        </div>
        <p className="mt-4 text-[13px] text-fg-3">Each row shows the preferred daily wave count and its Pattern Confidence, computed by the engine for every covered security.</p>
      </Section>

      {/* ------------------------------------------------ 6. ask viridia */}
      <Section eyebrow="Ask Viridia" title={<>Understand the analysis.</>}
        lede="Ask Viridia explains what the engine calculated, with the evidence behind it. It never invents a wave count of its own.">
        <div className="mx-auto max-w-[760px] rounded-[var(--r-lg)] border border-line" style={{ boxShadow: "var(--shadow-md)" }}>
          <div className="flex items-center gap-2.5 border-b border-line px-6 py-4">
            <ViridiaMark size={18} className="text-brand" />
            <span className="text-[14px] font-semibold">Ask Viridia</span>
            <span className="ml-auto text-[12.5px] text-fg-3">Illustrative example</span>
          </div>
          <div className="flex flex-col gap-5 px-6 py-6">
            <div className="self-end rounded-[var(--r-lg)] bg-hover px-4 py-2.5 text-[14.5px]">Why is EXAMPLE labeled Wave 3?</div>
            <div className="flex flex-col gap-4 text-[14.5px] leading-relaxed">
              <p>The preferred count reads the advance from {EXAMPLE.w2.p.toFixed(2)} as wave 3 of an impulse. It passes every rule checked so far:</p>
              <ul className="flex flex-col gap-2">
                {[
                  `Wave 2 held above the wave 1 origin at ${EXAMPLE.origin.p.toFixed(2)}, retracing ${(EXAMPLE.retrace2 * 100).toFixed(0)}% of wave 1.`,
                  `Price has moved beyond the wave 1 high at ${EXAMPLE.w1.p.toFixed(2)}.`,
                  "Wave 3 is already longer than wave 1, so it can't end up the shortest.",
                  `The 1.618 extension of wave 1 at ${EXAMPLE.ext1618.toFixed(2)} sits inside the ${EXAMPLE.zone.lo.toFixed(2)}–${EXAMPLE.zone.hi.toFixed(2)} Fibonacci zone.`,
                ].map((t) => (
                  <li key={t} className="flex gap-3"><span className="mt-[3px] text-brand" aria-hidden>✓</span><span className="text-fg-2">{t}</span></li>
                ))}
              </ul>
              <p><span className="font-semibold">Invalidation:</span> <span className="text-fg-2">a move below {EXAMPLE.countLevel.toFixed(2)}, the wave 2 low, would mean wave 3 hasn&apos;t begun; below {EXAMPLE.invalidation.toFixed(2)}, the wave 1 origin, the impulse itself breaks the rules. The alternate reading, a completed A-B-C, would then lead.</span></p>
            </div>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------ pricing / access */}
      <section id="pricing" className="border-t border-line">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-6 py-24 md:grid-cols-[1fr_1fr] md:items-end">
          <div>
            <p className="eyebrow">Access</p>
            <h2 className="h2 mt-3">Free during the beta.</h2>
            <p className="lede mt-4 max-w-[520px]">Every security, wave count, setup, the Brief and Portfolio X-Ray are open now. A free account adds watchlists and saved preferences. Paid plans come later, and you&apos;ll choose one before anything is charged.</p>
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <Link href="/signup" className="btn pri lg">Create a free account</Link>
            <span className="text-[13px] text-fg-3">No card required.</span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ closing */}
      <section className="brand-surface">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-8 px-6 py-24 text-white md:flex-row md:items-end md:justify-between">
          <h2 className="h2 max-w-[640px] text-white">Research markets. Understand portfolios. Prepare clients.</h2>
          <Link href="/signup" className="btn lg border-white bg-white text-brand-dark hover:bg-white/90">Start free</Link>
        </div>
      </section>

      {/* ------------------------------------------------ footer */}
      <footer className="border-t border-line bg-panel">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-6 py-16 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="flex flex-col gap-4">
            <ViridiaLockup />
            <p className="max-w-[280px] text-[13.5px] text-fg-3">The research and intelligence terminal for advisors, RIAs and portfolio managers.</p>
          </div>
          {[
            ["Product", [["Brief", "/terminal"], ["Portfolio X-Ray", "/portfolio"], ["Setups", "/setups"], ["Scanner", "/scanner"], ["Markets", "/markets"]]],
            ["Resources", [["Methodology", "#methodology"], ["Data", "/data-sources"], ["Documentation", "/data-sources"]]],
            ["Company", [["About", "#product"], ["Contact", "#disclosures"]]],
            ["Legal", [["Terms", "#disclosures"], ["Privacy", "#disclosures"], ["Disclosures", "#disclosures"]]],
          ].map(([h, links]) => (
            <div key={h as string}>
              <div className="text-[13px] font-semibold">{h as string}</div>
              <ul className="mt-3 flex flex-col gap-2">
                {(links as string[][]).map(([l, href]) => <li key={l}><Link href={href} className="text-[13.5px] text-fg-2 hover:text-fg">{l}</Link></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div id="disclosures" className="mx-auto max-w-[1200px] border-t border-line px-6 py-8 text-[12.5px] leading-relaxed text-fg-3">
          <p>
            Viridia Terminal provides research tools and educational market analysis. It is not investment advice, and nothing here is a
            recommendation to buy, sell or hold any security. Elliott Wave and Fibonacci analysis describe possible market structures; they do not
            predict prices, and every interpretation can be invalidated. Pattern confidence scores are heuristic measures of fit, not probabilities.
            Setup track records are historical replays of the engine with no look-ahead; they exclude costs and delisted securities, and past
            results do not predict future ones. Market data is end of day, sourced from Massive and U.S. exchange symbol directories, and may
            be delayed or contain errors. Illustrations on this page use a synthetic price series. Past performance does not guarantee future results.
          </p>
          <p className="mt-4">© {new Date().getFullYear()} Viridia</p>
        </div>
      </footer>
    </div>
  );
}

function Section({ id, eyebrow, title, lede, children }: { id?: string; eyebrow: string; title: React.ReactNode; lede: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1200px] px-6 py-24 md:py-28">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="h2 mt-3 max-w-[760px]">{title}</h2>
        <p className="lede mt-5 max-w-[680px]">{lede}</p>
        <div className="mt-14">{children}</div>
      </div>
    </section>
  );
}

function CountCard({ color, name, score, text }: { color: string; name: string; score: number; text: string }) {
  return (
    <div className="rounded-[var(--r-lg)] border border-line px-5 py-4">
      <div className="flex items-center gap-2.5">
        <span className="h-[3px] w-5 rounded-full" style={{ background: color }} aria-hidden />
        <span className="text-[14px] font-semibold">{name}</span>
        <span className="num ml-auto text-[14px] font-semibold">{score}<span className="font-normal text-fg-3"> / 100</span></span>
      </div>
      <p className="mt-1.5 text-[14px] text-fg-2">{text}</p>
      <div className="bar mt-3"><i style={{ width: `${score}%`, background: color }} /></div>
    </div>
  );
}

function Illustrative() {
  return <p className="mt-4 text-[12.5px] text-fg-3">Illustrative example on a synthetic price series.</p>;
}
