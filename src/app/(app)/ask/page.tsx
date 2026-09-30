import type { Metadata } from "next";
import { AskWorkspace } from "@/components/ask/AskWorkspace";

export const metadata: Metadata = { title: "Ask Viridia" };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q;
  return <AskWorkspace initialQ={typeof q === "string" && q.trim() ? q.slice(0, 600) : null} />;
}
