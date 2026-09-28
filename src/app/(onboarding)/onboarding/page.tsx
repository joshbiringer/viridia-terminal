import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { scan } from "@/lib/market-data/snapshot";
import { db } from "@/lib/supabase";
import { Onboarding, type Suggestion } from "@/components/onboarding/Onboarding";

export const metadata: Metadata = { title: "Welcome" };

/** Suggestions are the most actively traded names right now, not a hand-picked list. */
async function suggestions(type: "common" | "etf"): Promise<Suggestion[]> {
  const rows = await scan({ p_type: type, p_sort: "dollar_volume", p_limit: 8 }).catch(() => []);
  if (!rows.length) return [];
  const { data } = await db().from("securities").select("id, symbol").in("symbol", rows.map((r) => r.symbol)).eq("is_active", true);
  const ids = new Map((data ?? []).map((r) => [r.symbol as string, r.id as number]));
  return rows.filter((r) => ids.has(r.symbol)).map((r) => ({ id: ids.get(r.symbol)!, symbol: r.symbol, name: r.name }));
}

export default async function OnboardingPage() {
  const v = await getViewer();
  if (!v) redirect("/signin?next=/onboarding");
  const [stocks, etfs] = await Promise.all([suggestions("common"), suggestions("etf")]);
  return <Onboarding userId={v.id} firstName={v.firstName ?? ""} stocks={stocks} etfs={etfs} />;
}
