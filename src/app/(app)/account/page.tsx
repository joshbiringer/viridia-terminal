import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { authClient } from "@/lib/supabase/server";
import { CURRENT_PLAN } from "@/lib/plan";
import { fmtDate } from "@/lib/format";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "Account" };

export default async function AccountOverview() {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin?next=/account");
  const sb = await authClient();
  const [{ count: lists }, { count: items }] = await Promise.all([
    sb.from("watchlists").select("id", { count: "exact", head: true }),
    sb.from("watchlist_items").select("security_id", { count: "exact", head: true }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-panel-2 text-[18px] font-semibold text-brand ring-1 ring-line">{viewer.initials}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold tracking-[-0.015em]">{viewer.displayName}</div>
          <div className="truncate text-[13.5px] text-fg-2">{viewer.email}</div>
          <div className="caption mt-0.5">Member since {fmtDate(viewer.createdAt)}</div>
        </div>
        <Link href="/account/profile" className="btn">Edit profile</Link>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5">
          <div>
            <div className="caption">Current plan</div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-[17px] font-semibold tracking-[-0.015em]">{CURRENT_PLAN.name}</span>
              <span className="num text-[14px] text-fg-2">{CURRENT_PLAN.price}</span>
            </div>
            <p className="page-desc mt-1 max-w-[560px] text-[13.5px]">{CURRENT_PLAN.summary}</p>
          </div>
          <Link href="/account/billing" className="btn">Plan details</Link>
        </div>
      </section>

      <section className="grid gap-px overflow-hidden rounded-[var(--r-lg)] border border-line bg-line sm:grid-cols-3">
        {[
          ["Watchlists", lists ?? 0, "/watchlist"],
          ["Securities watched", items ?? 0, "/watchlist"],
          ["Alerts", "Not available yet", null],
        ].map(([k, v, href]) => (
          <div key={k as string} className="bg-panel px-5 py-4">
            <div className="caption">{k}</div>
            <div className={`mt-1 ${typeof v === "number" ? "num text-[20px] font-semibold tracking-[-0.02em]" : "text-[13.5px] text-fg-3"}`}>{v}</div>
            {href && <Link href={href as string} className="mt-1 inline-block text-[12.5px] text-brand hover:underline">Open watchlist</Link>}
          </div>
        ))}
      </section>

      <section>
        <h2 className="section-title">Settings</h2>
        <ul className="mt-3 grid gap-px overflow-hidden rounded-[var(--r-lg)] border border-line bg-line sm:grid-cols-2">
          {([
            ["Preferences", "Theme, default chart timeframe, wave degree and landing page", "/account/preferences", "sliders"],
            ["Security", "Password and signed-in devices", "/account/security", "shield"],
            ["Notifications", "Choose which market events to hear about", "/account/notifications", "bell"],
            ["Data & Privacy", "Export your data or delete your account", "/account/data", "lock"],
          ] as const).map(([t, d, href, icon]) => (
            <li key={t} className="bg-panel">
              <Link href={href} className="group flex items-start gap-3 px-5 py-4 transition-colors duration-[var(--t-fast)] hover:bg-hover">
                <Icon name={icon} className="mt-0.5 h-[16px] w-[16px] text-fg-3" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium">{t}</span>
                  <span className="block text-[12.5px] text-fg-2">{d}</span>
                </span>
                <Icon name="chevronRight" className="mt-0.5 h-[15px] w-[15px] text-fg-3" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
