import Link from "next/link";
import { ViridiaLockup } from "@/components/ViridiaMark";

/** Sign-in and sign-up: a dark brand panel beside one form, nothing else competing for attention. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-full bg-bg lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="dark-band relative isolate hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-14">
        <span aria-hidden className="gradient-band absolute inset-0 -z-10 opacity-80" />
        <span aria-hidden className="globe-stars absolute inset-0 -z-10" />
        <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-[#07140F]/40 to-[#07140F]" />
        <Link href="/" aria-label="Viridia home"><ViridiaLockup light /></Link>
        <div>
          <p className="f-eyebrow text-white/80">Viridia Terminal</p>
          <p className="f-display mt-5 max-w-[520px] text-white">See the structure behind the market.</p>
          <p className="f-label mt-8 text-white/55">Research tool · Not investment advice</p>
        </div>
      </aside>
      <div className="flex min-h-full flex-col">
        <header className="flex h-[68px] items-center px-5 sm:px-8 lg:hidden">
          <Link href="/" aria-label="Viridia home"><ViridiaLockup /></Link>
        </header>
        <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-[8vh] lg:items-center lg:pt-0">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>
        <footer className="px-5 pb-6 text-center text-[12px] text-fg-3 sm:px-8">
          Viridia is a research tool, not investment advice. <Link href="/data-sources" className="underline-offset-2 hover:underline">How the data works</Link>
        </footer>
      </div>
    </div>
  );
}
