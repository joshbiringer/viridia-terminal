import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { authClient } from "@/lib/supabase/server";
import { SettingsRow, SettingsSection } from "@/components/ui/SettingsRow";

export const metadata: Metadata = { title: "Usage" };

/** Real counts from the account. The beta imposes no limits, so none are shown. */
export default async function UsagePage() {
  const v = await getViewer();
  if (!v) redirect("/signin?next=/account/usage");
  const sb = await authClient();
  const [{ count: lists }, { count: items }] = await Promise.all([
    sb.from("watchlists").select("id", { count: "exact", head: true }),
    sb.from("watchlist_items").select("security_id", { count: "exact", head: true }),
  ]);
  return (
    <SettingsSection title="Usage" description="There are no usage limits during the beta.">
      <SettingsRow label="Watchlists" help={<Link href="/watchlist" className="text-brand hover:underline">Manage watchlists</Link>}>
        <span className="num text-[15px] font-medium">{lists ?? 0}</span>
      </SettingsRow>
      <SettingsRow label="Securities watched"><span className="num text-[15px] font-medium">{items ?? 0}</span></SettingsRow>
      <SettingsRow label="Wave analyses" help="Every security's counts, targets and zones."><span className="text-[13.5px]">Unlimited</span></SettingsRow>
      <SettingsRow label="Alerts" help="Price, zone and invalidation alerts are in development."><span className="text-[13.5px] text-fg-3">Not available yet</span></SettingsRow>
      <SettingsRow label="AI research answers" help="Ask Viridia is in development."><span className="text-[13.5px] text-fg-3">Not available yet</span></SettingsRow>
    </SettingsSection>
  );
}
