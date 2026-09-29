import type { Metadata } from "next";
import Link from "next/link";
import { loadMission, briefTitle } from "@/lib/analysis/mission-page";
import { DayBrief } from "@/components/brief/DayBrief";

export const metadata: Metadata = { title: "Prepare my day" };
export const dynamic = "force-dynamic";

/** Prepare My Day: the day's briefing on its own page, from the same data as Mission Control. */
export default async function Brief() {
  const m = await loadMission();
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-3">
      <nav className="text-[12.5px] text-fg-3"><Link href="/terminal" className="hover:text-brand">Mission Control</Link> / Prepare my day</nav>
      {!m.ok && <p className="card px-4 py-3 text-[13px]" style={{ color: "var(--warn)" }} role="status">Market data didn&apos;t load this time; reload in a minute.</p>}
      <DayBrief title={briefTitle()} sections={m.day} />
    </div>
  );
}
