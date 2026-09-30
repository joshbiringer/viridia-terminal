import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Help" };

const SHORTCUTS: [string[], string][] = [
  [["⌘", "K"], "Open search and commands (Ctrl K on Windows)"],
  [["/"], "Open search from anywhere outside a text field"],
  [["↑", "↓"], "Move through results"],
  [["↵"], "Open the selected result or run the command"],
  [["Esc"], "Close the search, a menu or a panel"],
];

const TOPICS: [string, string, string][] = [
  ["How wave counts are made", "Counts come from confirmed swing pivots and are checked against the hard rules. Nothing is labeled by hand or by a language model.", "/analysis/rulebook"],
  ["What a confluence zone is", "A price band where two or more independent Fibonacci relationships agree. Strength counts them; it is not a probability.", "/analysis/fibonacci"],
  ["Where the data comes from", "Listings from Nasdaq Trader and the SEC, daily prices from Massive, refreshed automatically.", "/data-sources"],
];

export default function HelpPage() {
  return (
    <>
      <PageHeader title="Help" description="Shortcuts, how Viridia's analysis works, and where to go next." />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section id="shortcuts" className="scroll-mt-24">
          <h2 className="section-title">Keyboard shortcuts</h2>
          <dl className="mt-3 divide-y divide-line border-y border-line">
            {SHORTCUTS.map(([keys, what]) => (
              <div key={what} className="flex items-center justify-between gap-6 py-3 text-[13.5px]">
                <dt className="text-fg-2">{what}</dt>
                <dd className="flex flex-none gap-1">{keys.map((k) => <kbd key={k}>{k}</kbd>)}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h2 className="section-title">How it works</h2>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {TOPICS.map(([t, body, href]) => (
              <li key={t}>
                <Link href={href} className="group block py-3.5">
                  <span className="flex items-center justify-between text-[13.5px] font-medium">{t}<span className="text-fg-3 transition-transform duration-[var(--t-fast)] group-hover:translate-x-0.5">→</span></span>
                  <span className="mt-0.5 block text-[13px] text-fg-2">{body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
