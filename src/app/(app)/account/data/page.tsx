import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { DataPrivacy } from "@/components/account/DataPrivacy";

export const metadata: Metadata = { title: "Data & Privacy" };

export default async function DataPage() {
  const v = await getViewer();
  if (!v) redirect("/signin?next=/account/data");
  return <DataPrivacy email={v.email} />;
}
