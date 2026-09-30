import Link from "next/link";
import { ViridiaLockup } from "./ViridiaMark";
import { HEADER_NAV } from "@/lib/nav";

/**
 * The dark footer band: a closing call to action over the brand gradient, then the sections, the
 * methodology links and the research notice.
 */
export function SiteFooter({ cta = true, note }: { cta?: boolean; note?: React.ReactNode }) {
  return (
    <footer className="dark-band relative mt-16 overflow-hidden">
      <span aria-hidden className="gradient-band pointer-events-none absolute inset-0 opacity-90" />
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[#07140F]/30 to-[#07140F]" />
      {cta && (
        <div className="relative mx-auto flex max-w-[1600px] flex-col items-center gap-7 px-6 pb-20 pt-28 text-center md:pt-36">
          <p className="f-eyebrow text-white/80">Viridia Terminal</p>
          <h2 className="f-display max-w-[900px] text-white">See the structure behind the market.</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="btn white lg">Start free</Link>
            <Link href="/terminal" className="btn light lg">Explore the Terminal</Link>
          </div>
        </div>
      )}
      <div className={`relative mx-auto max-w-[1600px] px-6 pb-14 lg:px-8 ${cta ? "" : "pt-16"}`}>
        <div className="flex flex-col gap-12 border-t border-white/15 pt-12 lg:flex-row lg:justify-between">
          <Link href="/terminal" className="w-fit" aria-label="Viridia home"><ViridiaLockup light /></Link>
          <div className="grid grid-cols-2 gap-x-12 gap-y-10 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-16">
            {HEADER_NAV.filter((g) => g.items.length > 1).map((g) => (
              <div key={g.label} className="flex flex-col gap-3">
                <p className="f-label text-white/50">{g.label}</p>
                {g.items.map((it) => <Link key={it.href} href={it.href} className="text-[15px] font-[300] text-white/80 transition-colors hover:text-white">{it.label}</Link>)}
              </div>
            ))}
            <div className="flex flex-col gap-3">
              <p className="f-label text-white/50">Workspace</p>
              {HEADER_NAV.filter((g) => g.items.length === 1).map((g) => <Link key={g.label} href={g.items[0].href} className="text-[15px] font-[300] text-white/80 transition-colors hover:text-white">{g.label}</Link>)}
            </div>
          </div>
        </div>
        {note && <div className="mt-14 max-w-[980px] text-[12.5px] font-[300] leading-relaxed text-white/60">{note}</div>}
        <div className="mt-14 flex flex-col gap-3 border-t border-white/15 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="f-label text-white/55">©{new Date().getFullYear()} Viridia. Research output, not investment advice.</p>
          <div className="flex gap-6">
            <Link href="/data-sources" className="f-label text-white/55 transition-colors hover:text-white">Data &amp; Methodology</Link>
            <Link href="/help" className="f-label text-white/55 transition-colors hover:text-white">Help</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
