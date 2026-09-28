import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authClient } from "@/lib/supabase/server";
import { SecurityForm } from "@/components/account/SecurityForm";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ updated?: string }> }) {
  const sb = await authClient();
  const { data } = await sb.auth.getUser();
  if (!data.user) redirect("/signin?next=/account/security");
  return <SecurityForm updated={(await searchParams).updated === "password"} lastSignIn={data.user.last_sign_in_at ?? null} />;
}
