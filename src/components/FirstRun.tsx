import Link from "next/link";
import { OpenPaletteButton } from "./OpenPaletteButton";
import { Icon } from "./Icon";

/**
 * Shown on Home until a signed-in user has a watchlist, or right after onboarding, and to visitors
 * as a quiet invitation. Suggestions are the day's most actively traded names, not a fixed list.
 */
export function FirstRun({ signedIn, name, suggestions }: { signedIn: boolean; name: string | null; suggestions: { symbol: string; name: string }[] }) {
  return (
    <section className="grid gap-6 rounded-[var(--r-lg)] border border-line bg-panel px-6 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div>
        <h2 className="section-title text-[16px]">
          {signedIn ? `Welcome to Viridia${name ? `, ${name}` : ""}. Let's analyze your first market.` : "See the structure behind any market."}
        </h2>
        <p className="page-desc mt-1 max-w-[640px]">
          Open any security to see its swing structure, the Elliott Wave counts that pass every rule, the price that would invalidate
          each one, and where Fibonacci relationships cluster.
        </p>
        {suggestions.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="caption mr-1">Most active:</span>
            {suggestions.map((s) => (
              <Link key={s.symbol} href={`/terminal/${encodeURIComponent(s.symbol)}`} title={s.name}
                className="flex h-8 items-center rounded-[var(--r-md)] border border-line px-3 text-[13px] font-medium text-fg-2 transition-colors duration-[var(--t-fast)] hover:border-line-2 hover:text-fg">
                {s.symbol}
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 lg:flex-col lg:items-stretch">
        <OpenPaletteButton label="Search a ticker" className="btn pri" />
        {signedIn
          ? <Link href="/watchlist" className="btn"><Icon name="watchlist" />Build a watchlist</Link>
          : <Link href="/signup" className="btn">Create a free account</Link>}
      </div>
    </section>
  );
}
