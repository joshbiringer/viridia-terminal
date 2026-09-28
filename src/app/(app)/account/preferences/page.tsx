import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DEFAULT_PREFERENCES, getPreferences, getViewer } from "@/lib/auth";
import { PreferencesForm } from "@/components/account/PreferencesForm";

export const metadata: Metadata = { title: "Preferences" };

export default async function PreferencesPage() {
  const v = await getViewer();
  if (!v) redirect("/signin?next=/account/preferences");
  const prefs = (await getPreferences()) ?? DEFAULT_PREFERENCES;
  return <PreferencesForm userId={v.id} initial={prefs} />;
}
