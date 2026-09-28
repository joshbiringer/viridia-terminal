import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PLANNED } from "@/lib/nav";
import { PageHeader } from "@/components/ui/PageHeader";

type Props = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: PLANNED[(await params).slug.join("/")]?.title ?? "Not found" };
}

export default async function PlannedSection({ params }: Props) {
  const p = PLANNED[(await params).slug.join("/")];
  if (!p) notFound();
  return (
    <>
      <PageHeader title={p.title} meta={`In development · ${p.phase}`} description={p.summary} />
      <section className="max-w-[760px]">
        <h2 className="section-title">What this section will include</h2>
        <ul className="mt-3 flex flex-col gap-2 text-[14px] text-fg-2">
          {p.items.map((i) => <li key={i} className="flex gap-2.5"><span className="mt-[9px] h-1 w-1 flex-none rounded-full bg-fg-3" />{i}</li>)}
        </ul>
        <div className="mt-6 flex gap-2"><Link className="btn pri" href="/terminal">Back to Home</Link><Link className="btn" href="/data-sources">See the roadmap</Link></div>
      </section>
    </>
  );
}
