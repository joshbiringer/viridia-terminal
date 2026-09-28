"use client";

import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

/** One-time orientation on the first analysis after onboarding. Dismissing removes ?welcome. */
export function WelcomeGuide({ symbol }: { symbol: string }) {
  const router = useRouter();
  const items: [string, string][] = [
    ["Market structure", "Trend and the latest confirmed swing highs and lows, at three degrees."],
    ["Candidate wave counts", "Every Elliott Wave labeling that passes the hard rules, each with the price that would invalidate it."],
    ["Fibonacci confluence", "Price bands where independent Fibonacci relationships agree, drawn on the chart."],
  ];
  return (
    <section className="rounded-[var(--r-lg)] border border-line bg-panel-2 px-5 py-4" aria-label="How to read this page">
      <div className="flex items-start justify-between gap-4">
        <h2 className="section-title">This is {symbol}&apos;s structure. Here&apos;s how to read it.</h2>
        <button className="btn ghost sm -mr-2 -mt-1 px-2 text-fg-3" aria-label="Dismiss" onClick={() => router.replace(`/terminal/${encodeURIComponent(symbol)}`, { scroll: false })}>
          <Icon name="x" className="h-3.5 w-3.5" />
        </button>
      </div>
      <ol className="mt-3 grid gap-4 md:grid-cols-3">
        {items.map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="num flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white">{i + 1}</span>
            <span><span className="block text-[13.5px] font-medium">{t}</span><span className="block text-[12.5px] text-fg-2">{d}</span></span>
          </li>
        ))}
      </ol>
    </section>
  );
}
