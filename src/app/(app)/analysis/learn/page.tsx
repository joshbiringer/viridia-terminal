import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { LessonDiagram } from "@/components/learn/LessonDiagram";
import { SelfCheck } from "@/components/learn/SelfCheck";
import { LESSONS, SOURCES, TOPICS, sourceOf } from "@/lib/learn/lessons";

export const metadata: Metadata = {
  title: "Learn",
  description: "Elliott Wave lessons built from worked examples in published analysis: the principle, the example, how to recognize it and what would prove it wrong.",
};

const fmt = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * Learn: Elliott Wave lessons drawn from worked examples in published analysis. Each lesson pairs a
 * principle with a real application, how to recognize it, how Viridia's engine treats it, what would
 * prove the reading wrong, where to see it in Viridia and a one-question self-check.
 */
export default function LearnPage() {
  return (
    <>
      <PageHeader
        title={<>Learn from <em>worked examples</em></>}
        description="Each lesson takes one Elliott Wave idea, shows how a published analyst applied it to real markets, and tells you how to recognize it yourself, how Viridia checks it and what would prove the reading wrong."
      />

      <section className="card flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:gap-6" aria-label="Sources">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-fg-3">Source</p>
          {SOURCES.map((s) => (
            <p key={s.id} className="mt-0.5 text-[13.5px]">
              <span className="font-[600]">{s.title}</span>, {s.issue} · {s.publisher}, edited by {s.authors} · data through {fmt(s.asOf)}
            </p>
          ))}
        </div>
        <p className="max-w-[560px] text-[12px] leading-relaxed text-fg-3">
          Lessons are written by Viridia. The examples paraphrase the source&apos;s published reading on its date, with credit; no charts or passages are reproduced, and the diagrams are schematics. The forecasts in them are the source&apos;s, not Viridia signals, and they can be wrong. Research output, not investment advice.
        </p>
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Lessons">
        {TOPICS.map((t) => (
          <div key={t} className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-fg-3">{t}</span>
            {LESSONS.filter((l) => l.topic === t).map((l) => <a key={l.id} href={`#${l.id}`} className="chip hover:border-line-2">{l.title.split(":")[0]}</a>)}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-4">
        {LESSONS.map((l, i) => {
          const src = sourceOf(l.source);
          return (
            <article key={l.id} id={l.id} className="card scroll-mt-24 overflow-hidden" aria-labelledby={`${l.id}-t`}>
              <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-5 py-3">
                <span className="num text-[12px] text-fg-3">{String(i + 1).padStart(2, "0")}</span>
                <h2 id={`${l.id}-t`} className="text-[17px] font-[620] tracking-[-0.01em]">{l.title}</h2>
                <span className="chip ml-auto">{l.topic}</span>
              </header>
              <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="flex min-w-0 flex-col gap-4">
                  <section>
                    <h3 className="text-[12px] font-medium text-fg-3">The principle</h3>
                    <p className="mt-1 text-[14px] leading-relaxed">{l.principle}</p>
                  </section>
                  <section className="rounded-[var(--r-md)] border-l-2 border-[var(--wave)] bg-panel-2 px-4 py-3">
                    <h3 className="text-[12px] font-medium text-fg-3">The example · {src.title}, {src.issue}</h3>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-fg-2">{l.example}</p>
                  </section>
                  <div className="grid gap-4 md:grid-cols-2">
                    <section>
                      <h3 className="text-[12px] font-medium text-fg-3">How to recognize it</h3>
                      <ul className="mt-1.5 flex flex-col gap-1.5">
                        {l.recognize.map((r) => <li key={r} className="flex gap-2 text-[13px] leading-snug"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--wave)]" aria-hidden />{r}</li>)}
                      </ul>
                    </section>
                    <section>
                      <h3 className="text-[12px] font-medium text-fg-3">What would prove it wrong</h3>
                      <p className="mt-1.5 text-[13px] leading-snug" style={{ color: "var(--neg)" }}>{l.wrong}</p>
                    </section>
                  </div>
                  <section>
                    <h3 className="text-[12px] font-medium text-fg-3">In Viridia</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-fg-2">{l.inViridia}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {l.tryIt.map((t) => <Link key={t.href} href={t.href} className="btn sm">{t.label}</Link>)}
                    </div>
                  </section>
                </div>
                <aside className="flex flex-col gap-4">
                  {l.diagram && <LessonDiagram d={l.diagram} />}
                  <SelfCheck c={l.check} id={l.id} />
                </aside>
              </div>
            </article>
          );
        })}
      </div>

      <p className="text-[12px] text-fg-3">
        Lessons cite <a href="https://www.elliottwave.com" className="underline hover:text-fg" rel="noopener noreferrer" target="_blank">Elliott Wave International</a>. For the rules Viridia enforces, see the <Link href="/analysis/rulebook" className="underline hover:text-fg">Rulebook</Link>.
      </p>
    </>
  );
}
