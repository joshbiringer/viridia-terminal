import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PLANNED } from "@/lib/nav";

type Props = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: PLANNED[(await params).slug.join("/")]?.title ?? "Not found" };
}

export default async function PlannedSection({ params }: Props) {
  const p = PLANNED[(await params).slug.join("/")];
  if (!p) notFound();
  return (
    <section className="mx-auto flex w-full max-w-[860px] flex-col gap-6 py-10">
      <div>
        <p className="eyebrow">{p.phase}</p>
        <h1 className="h2 mt-2">{p.title}</h1>
        <p className="lede mt-3 max-w-[640px]">{p.summary}</p>
      </div>
      <ul className="card divide-y divide-[var(--border)]">
        {p.items.map((i) => <li key={i} className="px-5 py-3.5 text-[14px]">{i}</li>)}
      </ul>
      <div className="flex gap-2"><Link className="btn" href="/terminal">Back to Terminal</Link><Link className="btn pri" href="/scanner">Open scanner</Link></div>
    </section>
  );
}
