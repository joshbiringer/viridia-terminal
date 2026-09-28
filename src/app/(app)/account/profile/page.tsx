import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { ProfileForm } from "@/components/account/ProfileForm";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const v = await getViewer();
  if (!v) redirect("/signin?next=/account/profile");
  return <ProfileForm userId={v.id} first={v.firstName ?? ""} last={v.lastName ?? ""} email={v.email} />;
}
