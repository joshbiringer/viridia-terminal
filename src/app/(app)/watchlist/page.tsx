import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { authClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { WatchlistView, type WatchRow } from "@/components/WatchlistView";

export const metadata: Metadata = { title: "Watchlist" };
export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const v = await getViewer();
  if (!v) redirect("/signin?next=/watchlist");
  const sb = await authClient();
  const { data, error } = await sb.rpc("my_watchlist", { p_watchlist: null });
  const rows = (data ?? []) as WatchRow[];
  const asOf = rows.reduce<string | null>((m, r) => (r.last_ts && (!m || r.last_ts > m) ? r.last_ts : m), null);
  return (
    <>
      <PageHeader
        title="Watchlist"
        description="Trend, swing structure and Fibonacci zones for everything you follow, at the last close."
      />
      {error ? <p className="text-[13.5px] text-neg">Couldn&apos;t load your watchlist: {error.message}</p>
        : <WatchlistView userId={v.id} initial={rows} asOf={asOf} />}
    </>
  );
}
