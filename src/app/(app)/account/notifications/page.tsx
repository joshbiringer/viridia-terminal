import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPreferences, getViewer } from "@/lib/auth";
import { NotificationsForm } from "@/components/account/NotificationsForm";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const v = await getViewer();
  if (!v) redirect("/signin?next=/account/notifications");
  const prefs = await getPreferences();
  return <NotificationsForm userId={v.id} initial={prefs?.notifications ?? {}} />;
}
