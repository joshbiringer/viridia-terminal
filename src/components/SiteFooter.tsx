import Link from "next/link";
import { ViridiaLockup } from "./ViridiaMark";
import { HEADER_NAV } from "@/lib/nav";

/**
 * The footer: an optional closing call to action, then the sections, the methodology links and the
 * research notice. A quiet panel band on the theme's own surfaces with a hairline border.
 */
export function SiteFooter({ cta = true, note }: { cta?: boolean; note?: React.ReactNode }) {
  const link = "text-[13.5px] text-fg-2 transition-colors hover:text-fg";
  return (
    <footer className="relative mt-16 border-t border-line bg-panel">
      {cta && (
        <div className="mx-auto flex max-w-[1600px] flex-col items-center gap-6 border-b border-line px-6 py-20 text-center">
          <h2 className="serif max-w-[900px] text-[clamp(34px,4vw,56px)] leading-[1.02] text-fg">See the <em>structure</em> behind the market.</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="btn pri lg">Start free</Link>
            <Link href="/terminal" className="btn lg">Explore the Terminal</Link>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-[1600px] px-6 pb-10 pt-12 lg:px-8">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <Link href="/terminal" className="w-fit" aria-label="Viridia home"><ViridiaLockup /></Link>
          <div className="grid grid-cols-2 gap-x-12 gap-y-8 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-14">
            {HEADER_NAV.filter((g) => g.items.length > 1).map((g) => (
              <div key={g.label} className="flex flex-col gap-2.5">
                <p className="text-[12px] font-medium text-fg-3">{g.label}</p>
                {g.items.map((it) => <Link key={it.href} href={it.href} className={link}>{it.label}</Link>)}
              </div>
            ))}
            <div className="flex flex-col gap-2.5">
              <p className="text-[12px] font-medium text-fg-3">Workspace</p>
              {HEADER_NAV.filter((g) => g.items.length === 1).map((g) => <Link key={g.label} href={g.items[0].href} className={link}>{g.label}</Link>)}
            </div>
          </div>
        </div>
        {note && <div className="mt-10 max-w-[980px] text-[12.5px] leading-relaxed text-fg-3">{note}</div>}
        <div className="mt-10 flex flex-col gap-3 border-t border-line pt-5 text-[12.5px] text-fg-3 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Viridia. Research output, not investment advice. Prices are end of day from Massive.</p>
          <div className="flex gap-5">
            <Link href="/data-sources" className="transition-colors hover:text-fg">Data and methodology</Link>
            <Link href="/help" className="transition-colors hover:text-fg">Help</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
