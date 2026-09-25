import Link from "next/link";
import type { Metadata } from "next";
import { RULEBOOK, RULES_VERSION, type Category, type Pattern } from "@engine/rules";
import { EXAMPLE, EXAMPLE_VALIDATION } from "@/lib/illustration";

export const metadata: Metadata = { title: "Rulebook" };

const CATEGORY: Record<Category, { label: string; chip: string; what: string }> = {
  rule: { label: "Rule", chip: "ink", what: "Always holds. A count that breaks one is eliminated; nothing can override it." },
  guideline: { label: "Guideline", chip: "acc", what: "Usually holds. Counts as supporting evidence when ranking, never as a filter." },
  fibonacci: { label: "Fibonacci", chip: "fib", what: "A typical Fibonacci proportion. Supporting evidence only." },
  heuristic: { label: "Heuristic", chip: "", what: "A Viridia judgment call, stated openly. Supporting evidence only." },
};

const SOURCE: Record<string, string> = {
  Essentials: "Prechter, Essentials of the Elliott Wave Principle",
  EWF: "Elliott Wave Forecast, Elliott Wave Theory",
  EWP: "Frost & Prechter, Elliott Wave Principle",
  Viridia: "Viridia engine",
};

const GROUPS: { title: string; blurb: string; match: (id: string, applies: Pattern[]) => boolean }[] = [
  { title: "Every pattern", blurb: "Structural checks applied before any Elliott rule.", match: (id) => id.startsWith("structure.") },
  { title: "Motive waves: impulses and diagonals", blurb: "Five waves in the direction of the larger trend, labeled 1-2-3-4-5.", match: (id) => id.startsWith("motive.") },
  { title: "Impulse", blurb: "The most common motive wave. Subdivides 5-3-5-3-5.", match: (id) => id.startsWith("impulse.") },
  { title: "Diagonals", blurb: "Wedge-shaped motive waves in the wave 1 or A position (leading) or wave 5 or C position (ending).", match: (id) => id.startsWith("diagonal.") },
  { title: "Zigzag", blurb: "A sharp A-B-C correction, subdividing 5-3-5.", match: (id) => id.startsWith("zigzag.") },
  { title: "Flat", blurb: "A sideways A-B-C correction, subdividing 3-3-5: regular, expanded or running.", match: (id) => id.startsWith("flat.") },
  { title: "Triangle", blurb: "A sideways A-B-C-D-E correction: contracting, barrier, running or expanding.", match: (id) => id.startsWith("triangle.") },
  { title: "Combinations", blurb: "Two or three corrective patterns joined by X waves (W-X-Y, W-X-Y-X-Z).", match: (id) => id.startsWith("combo.") },
];

const ICON: Record<string, string> = { pass: "✓", fail: "✕", pending: "…", unverified: "?" };

export default function RulebookPage() {
  const counts = RULEBOOK.reduce<Record<string, number>>((a, r) => ((a[r.category] = (a[r.category] ?? 0) + 1), a), {});
  const ex = EXAMPLE_VALIDATION;
  return (
    <>
      <section className="max-w-[820px] pt-2">
        <p className="eyebrow">Phase 4 · {RULES_VERSION}</p>
        <h1 className="h2 mt-2">The rulebook.</h1>
        <p className="lede mt-3">
          Any wave count Viridia shows is checked against these rules by deterministic code first. Rules eliminate counts; guidelines
          and Fibonacci tendencies only add or subtract evidence. No language model can relabel a wave or excuse a broken rule.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line bg-line lg:grid-cols-4">
        {(Object.keys(CATEGORY) as Category[]).map((c) => (
          <div key={c} className="bg-panel px-5 py-4">
            <div className="flex items-center gap-2"><span className={`chip ${CATEGORY[c].chip}`}>{CATEGORY[c].label}</span><span className="num text-[13px] text-fg-3">{counts[c] ?? 0}</span></div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-fg-2">{CATEGORY[c].what}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          {GROUPS.map((g) => {
            const rows = RULEBOOK.filter((r) => g.match(r.id, r.appliesTo));
            return (
              <section key={g.title} className="card">
                <div className="card-h"><div><h2 className="card-t">{g.title}</h2><p className="card-s mt-0.5">{g.blurb}</p></div></div>
                <ul className="divide-y divide-[var(--border)]">
                  {rows.map((r) => (
                    <li key={r.id} className="flex flex-col gap-1.5 px-5 py-3.5 sm:flex-row sm:items-start sm:gap-4">
                      <span className={`chip ${CATEGORY[r.category].chip} w-fit shrink-0 sm:mt-0.5 sm:w-[84px] sm:justify-center`}>{CATEGORY[r.category].label}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] leading-snug">{r.text}</p>
                        <p className="mt-1 text-[12px] text-fg-3">{SOURCE[r.source]} · <code className="text-[11.5px]">{r.id}</code></p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <aside className="flex flex-col gap-6 xl:sticky xl:top-6 xl:self-start">
          <section className="card">
            <div className="card-h"><div><h2 className="card-t">What a check returns</h2><p className="card-s mt-0.5">Illustrative count on a synthetic series</p></div></div>
            <div className="flex flex-col gap-4 px-5 py-5 text-[13px]">
              <p className="text-fg-2">
                Impulse in wave {ex.inProgress}: origin <span className="num">{EXAMPLE.origin.p.toFixed(2)}</span>, wave 1 high{" "}
                <span className="num">{EXAMPLE.w1.p.toFixed(2)}</span>, wave 2 low <span className="num">{EXAMPLE.w2.p.toFixed(2)}</span>.
              </p>
              <ul className="flex flex-col gap-2">
                {ex.checks.map((c) => (
                  <li key={c.id} className="flex gap-2.5">
                    <span className={`num w-4 shrink-0 text-center font-semibold ${c.status === "pass" ? "text-pos" : c.status === "fail" ? "text-neg" : "text-fg-3"}`} aria-label={c.status}>{ICON[c.status]}</span>
                    <span className="min-w-0"><span className={c.category === "rule" ? "font-medium" : "text-fg-2"}>{c.text}</span><span className="block text-[12px] text-fg-3">{c.detail}</span></span>
                  </li>
                ))}
              </ul>
              <div className="rounded-[10px] bg-panel-2 px-4 py-3">
                <div className="font-medium">Invalidation</div>
                {ex.invalidations.map((v) => (
                  <p key={v.price + v.kind} className="mt-1 text-fg-2">
                    <span className="num font-medium text-fg">{v.side === "below" ? "Below" : "Above"} {v.price.toFixed(2)}</span>{" "}
                    <span className="text-[12px] text-fg-3">({v.kind === "rule" ? "rule" : "count"})</span>: {v.reason}.
                  </p>
                ))}
              </div>
              <p className="text-[12px] text-fg-3">
                Pattern confidence is added by the ranking engine (Phase 7). Until then no score is shown.
              </p>
            </div>
          </section>
          <section className="card px-5 py-5 text-[13px] leading-relaxed text-fg-2">
            <p><span className="font-medium text-fg">Where counts come from.</span> Candidate counts (Phase 5) are built only from confirmed
            pivots, then checked here. A count is shown as of the bar its last pivot was confirmed, so no future price is used.</p>
            <Link href="/data-sources" className="mt-3 inline-block text-brand hover:underline">Build progress</Link>
          </section>
        </aside>
      </div>
    </>
  );
}
