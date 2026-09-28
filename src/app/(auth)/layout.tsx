import Link from "next/link";
import { ViridiaLockup } from "@/components/ViridiaMark";

/** Minimal frame for sign-in and sign-up: brand, one form, nothing else competing for attention. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-bg">
      <header className="flex h-[56px] items-center px-5 sm:px-8">
        <Link href="/" aria-label="Viridia home"><ViridiaLockup /></Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-[8vh]">
        <div className="w-full max-w-[380px]">{children}</div>
      </main>
      <footer className="px-5 pb-6 text-center text-[12px] text-fg-3 sm:px-8">
        Viridia is a research tool, not investment advice. <Link href="/data-sources" className="underline-offset-2 hover:underline">How the data works</Link>
      </footer>
    </div>
  );
}
