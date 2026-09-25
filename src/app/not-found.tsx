import Link from "next/link";
import { ViridiaMark } from "@/components/ViridiaMark";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <ViridiaMark size={32} className="text-brand" />
      <h1 className="h1">This page doesn&apos;t exist</h1>
      <p className="max-w-[440px] text-fg-2">Search any listed security with <kbd>⌘ K</kbd>, or head back to the terminal.</p>
      <div className="flex gap-2"><Link className="btn" href="/">Home</Link><Link className="btn pri" href="/terminal">Open Terminal</Link></div>
    </div>
  );
}
