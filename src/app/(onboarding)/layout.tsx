import Link from "next/link";
import { ViridiaLockup } from "@/components/ViridiaMark";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-bg">
      <header className="flex h-[56px] items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="Viridia home"><ViridiaLockup /></Link>
        <Link href="/terminal" className="text-[13px] text-fg-3 hover:text-fg">Skip for now</Link>
      </header>
      <main className="flex flex-1 justify-center px-5 pb-16 pt-[6vh]">
        <div className="w-full max-w-[560px]">{children}</div>
      </main>
    </div>
  );
}
