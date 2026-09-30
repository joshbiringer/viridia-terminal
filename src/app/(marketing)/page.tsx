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
import { SiteFooter } from "@/components/SiteFooter";
import { ModuleExplorer, type Module } from "@/components/marketing/ModuleExplorer";

export const metadata: Metadata = {
  title: { absolute: "Viridia: From market signal to client conversation" },
  description: "The research and intelligence terminal for advisors, RIAs and portfolio managers: market structure, portfolio X-ray and client-ready explanations in one place.",
};
export const revalidate = 900;

const NAV = [["Platform", "#platform"], ["Portfolio X-Ray", "/portfolio"], ["Markets", "/markets"], ["Methodology", "#methodology"], ["Access", "#pricing"]];

const MODULES: Module[] = [
  { name: "Viridia Research", status: "live", href: "/research", cta: "Research a company", points: [
    ["Every U.S.-listed security", "Rule-checked Elliott Wave counts, ranked, with the exact level that would invalidate each one."],
    ["Fibonacci confluence", "Zones where independent Fibonacci relationships overlap, anchored to the active count."],
    ["Viridia Intelligence", "Structure, wave, Fibonacci, momentum, regime and risk side by side, instead of a single rating."],
  ]},
  { name: "Viridia Markets", status: "live", href: "/terminal", cta: "Open Mission Control", points: [
    ["Mission Control", "What changed since the last session: Viridia's structural changes first, then market context."],
    ["Viridia Signals", "Strong structure, wave 3, Fibonacci confluence, near invalidation and more, each one click from the scanner."],
    ["Market regime", "Uptrend, mixed and downtrend shares with participation and 52-week extremes."],
  ]},
  { name: "Viridia Portfolio", status: "partial", href: "/portfolio", cta: "Run Portfolio X-Ray", points: [
    ["Portfolio X-Ray", "Concentration, risk contribution, factor and sector exposure, correlation clusters, stress tests and tax lots."],
    ["Structure by weight", "How much of a portfolio sits in uptrends, corrective counts or near a structural invalidation level."],
    ["Saved portfolios", "Snapshots, target weights and drift are live; model portfolios and attribution are in development."],
  ]},
  { name: "Viridia AI", status: "partial", href: "/terminal/SPY", cta: "See an explanation", points: [
    ["Ask Viridia", "Explains what the engine calculated, with the evidence, and never invents a count of its own."],
    ["Client versions", "Plain-language explanations without jargon, ready to copy."],
    ["Coming later", "Natural-language search across a practice."],
  ]},
  { name: "Viridia Advisor", status: "planned", points: [
    ["Client households", "Portfolios grouped by household, with review snapshots between meetings."],
    ["Meeting preparation", "What changed for each client since the last review."],
    ["Integrations", "CRM and custodian connections. Not available yet."],
  ]},
  { name: "Viridia Enterprise", status: "planned", points: [
    ["Investment committee", "A shared workspace for research decisions."],
    ["Firm-wide monitoring", "Structure and risk across every book."],
    ["Governance", "Controls and integrations for larger teams. Not available yet."],
  ]},
];

export default async function Landing() {
  let live: ScanRow[] = [];
  try { live = await scan({ p_sort: "dollar_volume", p_limit: 8 }); } catch { live = []; }

  return (
    <div className="overflow-x-clip bg-bg">
      <TrackEvent event="landing_view" />
      {/* ------------------------------------------------ header over the hero */}
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex max-w-[1600px] items-center gap-8 px-5 py-7 sm:px-8 lg:px-12 lg:py-9">
          <Link href="/" aria-label="Viridia home"><ViridiaLockup light /></Link>
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
            {NAV.map(([l, h]) => <Link key={l} href={h} className="whitespace-nowrap text-[15px] font-[600] text-white/80 transition-colors hover:text-white">{l}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/signin" className="btn light sm hidden sm:inline-flex">Sign in</Link>
            <Link href="/signup" className="btn white sm">Start free</Link>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------ hero */}
      <section className="dark-band relative isolate min-h-[100svh] overflow-hidden" id="product">
        <div aria-hidden className="globe-stars pointer-events-none absolute inset-0 -z-10" />
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={{ background: "radial-gradient(60% 70% at 78% 20%, rgba(60,180,131,.22) 0%, transparent 60%), radial-gradient(50% 60% at 95% 85%, rgba(244,211,138,.14) 0%, transparent 60%), linear-gradient(180deg, #07140F 0%, #0A2019 70%, #07140F 100%)" }} />
        <div aria-hidden className="pointer-events-none absolute right-[-8%] top-[18%] -z-10 hidden w-[58%] opacity-90 lg:block"><HeroTerminalMock /></div>
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-[#07140F] via-[#07140F]/85 to-transparent" />
        <div className="mx-auto flex min-h-[100svh] max-w-[1600px] flex-col justify-end px-5 pb-20 pt-40 sm:px-8 lg:px-12 lg:pb-28">
          <p className="f-eyebrow text-[#7FE0B0]">For advisors, RIAs and portfolio managers</p>
          <h1 className="f-hero mt-6 max-w-[900px] text-white">From market signal to client conversation.</h1>
          <p className="f-body mt-7 max-w-[600px] text-white/80">
            Viridia brings market structure, portfolio intelligence and client-ready explanations into one research terminal, so you can see what changed, understand why it matters and explain it clearly.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/signup" className="btn white lg">Start free</Link>
            <Link href="/terminal" className="btn light lg">Explore the Terminal</Link>
          </div>
          <p className="f-label mt-6 text-white/55">Free during the beta · No card required · The Terminal is open without an account</p>
        </div>
      </section>

      {/* ------------------------------------------------ platform modules */}
      <Section eyebrow="One platform" title="Research, portfolios and markets in one terminal." id="platform">
        <div className="f-card px-6 py-10 md:px-[54px] md:py-16 lg:py-[90px]">
          <ModuleExplorer modules={MODULES} />
        </div>
      </Section>

      {/* ------------------------------------------------ where it's used (dark panel with link rows) */}
      <section className="px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1rem,4vw,2.5rem)]">
        <div className="relative isolate mx-auto flex min-h-[520px] max-w-[1600px] flex-col justify-between gap-12 overflow-hidden rounded-[14px] p-8 text-white md:p-14 lg:min-h-[640px] lg:flex-row lg:items-center lg:p-20">
          <div aria-hidden className="gradient-band absolute inset-0 -z-10 opacity-95" style={{ backgroundImage: "linear-gradient(115deg, #07140F 0%, #0A2A1F 45%, #176B4D 80%, #C9962F 120%)" }} />
          <div aria-hidden className="globe-stars absolute inset-0 -z-10 opacity-70" />
          <h2 className="f-hero max-w-[560px] text-white">Built for the research desk.</h2>
          <div className="w-full lg:max-w-2xl">
            {([
              ["Mission Control", "/terminal"], ["Portfolio X-Ray", "/portfolio"], ["Wave Scanner", "/scanner"], ["Setups and track record", "/setups"],
            ] as const).map(([l, h]) => (
              <Link key={l} href={h} className="group relative flex items-center gap-5 border-b border-white/35 py-5 opacity-85 transition-opacity duration-300 hover:opacity-100">
                <span className="f-subheading flex-1 text-white">{l}</span>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/60 text-white transition-colors group-hover:bg-white group-hover:text-[#07140F]">→</span>
                <span aria-hidden className="pointer-events-none absolute -bottom-px left-0 h-0.5 w-full origin-left scale-x-0 bg-white transition-transform duration-500 ease-[var(--ease-premium)] group-hover:scale-x-100" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ methodology (two columns in a card) */}
      <section id="methodology" className="scroll-mt-20 px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1rem,4vw,2.5rem)]">
        <div className="f-card mx-auto max-w-[1600px] px-6 py-10 md:px-12 md:py-16 lg:px-[90px] lg:py-[100px]">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-x-24">
            <div className="flex flex-col gap-6">
              <p className="f-eyebrow">Methodology</p>
              <h2 className="f-heading gradient-text max-w-[600px]">Markets move in structure.</h2>
              <p className="f-body-light max-w-[560px] text-fg-2">Viridia analyzes price structure across multiple timeframes to identify motive waves, corrective structures, Fibonacci relationships and objective invalidation levels.</p>
              <div className="mt-2 rounded-[12px] border border-line bg-bg px-4 py-6"><WaveSchematic className="h-auto w-full" /></div>
            </div>
            <ul className="flex flex-col gap-7 lg:justify-center lg:gap-9">
              {[
                ["Rules are never bent", "Wave 2 never retraces more than all of wave 1. Wave 3 is never the shortest motive wave. In an impulse, wave 4 never enters wave 1's price territory. A count that breaks one is discarded, whatever else it has going for it."],
                ["Guidelines add weight", "Alternation, channels and typical Fibonacci ratios raise or lower a count's confidence. They never override a rule."],
                ["Every count has a limit", "Each interpretation carries the exact price that would invalidate it, so you always know where it stops being true."],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-4">
                  <span className="f-diamond mt-[8px]" aria-hidden />
                  <div className="flex flex-col gap-1.5"><p className="f-body-bold">{t}</p><p className="f-body-light text-fg-2">{d}</p></div>
                </li>
              ))}
              <li className="flex flex-wrap gap-3 pt-2">
                <Link href="/analysis/rulebook" className="btn pri lg">Read the rulebook</Link>
                <Link href="/data-sources" className="btn lg">Data &amp; methodology</Link>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ counts */}
      <Section eyebrow="Preferred and alternate counts" title="One chart. Multiple interpretations."
        lede="Elliott Wave analysis can produce more than one structurally valid reading of the same chart. Viridia ranks them rather than pretending the uncertainty isn't there.">
        <div className="f-card grid gap-8 px-6 py-8 md:px-12 md:py-12 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-[12px] border border-line px-3 py-4"><IllustrativeChart layers={["waves", "alternate"]} className="h-auto w-full" /></div>
          <div className="flex flex-col justify-center gap-4">
            <CountCard color="var(--wave)" name="Preferred count" score={EXAMPLE.confidence} text="Wave 3 of an impulse is underway from the wave 2 low." />
            <CountCard color="var(--alt)" name="Alternate count" score={EXAMPLE.altConfidence} text="The advance is wave C of a correction and ends near the Fibonacci zone." />
            <p className="text-[13.5px] font-[300] leading-relaxed text-fg-2">
              Scores are pattern confidence: how well each count fits the rules, guidelines and Fibonacci evidence. They are not probabilities, and Viridia won&apos;t call them that until they&apos;re validated by out-of-sample backtesting.
            </p>
            <Illustrative />
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------ fibonacci */}
      <Section eyebrow="Fibonacci confluence" title="Where structure meets mathematics."
        lede="Fibonacci levels are anchored to the active wave count, never drawn across arbitrary highs and lows. Where independent measurements overlap, Viridia marks a zone instead of pretending one exact price is certain.">
        <div className="f-card grid items-center gap-10 px-6 py-8 md:px-12 md:py-12 lg:grid-cols-[1.25fr_1fr]">
          <div className="rounded-[12px] border border-line bg-bg px-4 py-6"><FibSchematic className="h-auto w-full" /></div>
          <div>
            <p className="f-label text-fg-3">Fibonacci confluence</p>
            <div className="num mt-3 text-[40px] font-[300] tracking-[-0.02em] text-fib">{EXAMPLE.zone.lo.toFixed(2)} – {EXAMPLE.zone.hi.toFixed(2)}</div>
            <p className="mt-1 text-[14px] text-fg-2">3 overlapping relationships</p>
            <ul className="mt-6 flex flex-col text-[15px]">
              <li className="f-row flex justify-between gap-4 py-3"><span>1.618 extension of wave 1</span><span className="num text-fg-3">{EXAMPLE.ext1618.toFixed(2)}</span></li>
              <li className="f-row flex justify-between gap-4 py-3"><span>0.618 retracement, higher degree</span><span className="num text-fg-3">57.40</span></li>
              <li className="f-row flex justify-between gap-4 py-3"><span>Prior structural resistance</span><span className="num text-fg-3">58.10</span></li>
            </ul>
            <div className="mt-5 flex items-baseline justify-between">
              <span className="f-label text-fg-3">Confluence</span>
              <span className="num text-[22px] font-[600]">8.6 <span className="text-[14px] font-[300] text-fg-3">/ 10</span></span>
            </div>
            <Illustrative />
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------ scanner (live data) */}
      <Section eyebrow="Scanner" title="Scan the market. Not just a watchlist."
        lede="Viridia covers every security listed on U.S. exchanges. The scanner below is live: the most actively traded names at the last close.">
        <div className="f-card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line px-6 py-4">
            <span className="card-t">Most active</span>
            <span className="text-[13px] text-fg-3">{live[0] ? `Close ${fmtDate(live[0].last_ts)}` : "Loading"}</span>
            <Link href="/scanner" className="btn sm ml-auto">Open the scanner</Link>
          </div>
          {live.length ? <ScannerTable rows={live} compact structure /> : <div className="px-6 py-10 text-center text-fg-2">Live data is temporarily unavailable.</div>}
        </div>
        <p className="mt-4 text-center text-[13px] text-fg-3">Each row shows the preferred daily wave count and its Pattern Confidence, computed by the engine for every covered security.</p>
      </Section>

      {/* ------------------------------------------------ ask viridia */}
      <Section eyebrow="Ask Viridia" title="Understand the analysis."
        lede="Ask Viridia explains what the engine calculated, with the evidence behind it. It never invents a wave count of its own.">
        <div className="f-card mx-auto max-w-[820px]">
          <div className="flex items-center gap-2.5 border-b border-line px-7 py-4">
            <ViridiaMark size={18} className="text-brand" />
            <span className="card-t">Ask Viridia</span>
            <span className="f-label ml-auto text-fg-3">Illustrative example</span>
          </div>
          <div className="flex flex-col gap-5 px-7 py-7">
            <div className="self-end rounded-[12px] bg-hover px-4 py-2.5 text-[15px]">Why is EXAMPLE labeled Wave 3?</div>
            <div className="flex flex-col gap-4 text-[15px] leading-relaxed">
              <p>The preferred count reads the advance from {EXAMPLE.w2.p.toFixed(2)} as wave 3 of an impulse. It passes every rule checked so far:</p>
              <ul className="flex flex-col gap-2.5">
                {[
                  `Wave 2 held above the wave 1 origin at ${EXAMPLE.origin.p.toFixed(2)}, retracing ${(EXAMPLE.retrace2 * 100).toFixed(0)}% of wave 1.`,
                  `Price has moved beyond the wave 1 high at ${EXAMPLE.w1.p.toFixed(2)}.`,
                  "Wave 3 is already longer than wave 1, so it can't end up the shortest.",
                  `The 1.618 extension of wave 1 at ${EXAMPLE.ext1618.toFixed(2)} sits inside the ${EXAMPLE.zone.lo.toFixed(2)}–${EXAMPLE.zone.hi.toFixed(2)} Fibonacci zone.`,
                ].map((t) => (
                  <li key={t} className="flex gap-3"><span className="f-diamond mt-[9px]" aria-hidden /><span className="font-[300] text-fg-2">{t}</span></li>
                ))}
              </ul>
              <p><span className="font-[700]">Invalidation:</span> <span className="font-[300] text-fg-2">a move below {EXAMPLE.countLevel.toFixed(2)}, the wave 2 low, would mean wave 3 hasn&apos;t begun; below {EXAMPLE.invalidation.toFixed(2)}, the wave 1 origin, the impulse itself breaks the rules. The alternate reading, a completed A-B-C, would then lead.</span></p>
            </div>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------ principles strip */}
      <section id="pricing" className="px-6 py-20 md:py-24">
        <div className="mx-auto flex max-w-5xl flex-col items-center">
          <h2 className="mb-10 max-w-xl text-center text-[26px] font-[400] leading-snug text-brand md:text-[30px]">Where rule-checked structure meets institutional research.</h2>
          <div className="flex w-full flex-wrap justify-center gap-4">
            {["Every U.S. listing", "Rules never bent", "No look-ahead replays", "Free during beta"].map((b) => (
              <div key={b} className="flex w-[calc(50%-0.5rem)] items-center justify-center rounded-[12px] bg-panel px-6 py-5 text-center sm:w-60"><p className="font-mono text-[13px] font-bold uppercase tracking-[0.18em] text-fg-2">{b}</p></div>
            ))}
          </div>
          <p className="mt-10 max-w-[620px] text-center text-[15px] font-[300] leading-relaxed text-fg-2">Every security, wave count, setup, Mission Control and Portfolio X-Ray are open now. A free account adds watchlists, saved portfolios and preferences. Paid plans come later, and you&apos;ll choose one before anything is charged.</p>
        </div>
      </section>

      <SiteFooter note={<p id="disclosures">
        Viridia Terminal provides research tools and educational market analysis. It is not investment advice, and nothing here is a
        recommendation to buy, sell or hold any security. Elliott Wave and Fibonacci analysis describe possible market structures; they do not
        predict prices, and every interpretation can be invalidated. Pattern confidence scores are heuristic measures of fit, not probabilities.
        Setup track records are historical replays of the engine with no look-ahead; they exclude costs and delisted securities, and past
        results do not predict future ones. Market data is end of day, sourced from Massive and U.S. exchange symbol directories, and may
        be delayed or contain errors. Illustrations on this page use a synthetic price series. Past performance does not guarantee future results.
      </p>} />
    </div>
  );
}

function Section({ id, eyebrow, title, lede, children }: { id?: string; eyebrow: string; title: React.ReactNode; lede?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 px-[clamp(1rem,4vw,2.5rem)] py-[clamp(2rem,5vw,4.5rem)]">
      <div className="mx-auto max-w-[1600px]">
        <div className="mx-auto flex max-w-[800px] flex-col items-center gap-6 text-center md:gap-8">
          <p className="f-eyebrow">{eyebrow}</p>
          <h2 className="f-heading gradient-text">{title}</h2>
          {lede && <p className="f-body-light max-w-[680px] text-fg-2">{lede}</p>}
        </div>
        <div className="mt-12 md:mt-16">{children}</div>
      </div>
    </section>
  );
}

function CountCard({ color, name, score, text }: { color: string; name: string; score: number; text: string }) {
  return (
    <div className="f-row px-1 py-4">
      <div className="flex items-center gap-2.5">
        <span className="h-[3px] w-5 rounded-full" style={{ background: color }} aria-hidden />
        <span className="f-label text-fg-2">{name}</span>
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
