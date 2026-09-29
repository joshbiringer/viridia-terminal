import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { MeetingPrep } from "@/components/portfolio/MeetingPrep";

export const metadata: Metadata = { title: "Meeting prep" };

export default function ReviewPage() {
  return (
    <>
      <PageHeader
        title="Meeting prep"
        description="For a saved portfolio: what changed since the last review, concentration and drift, risk, tax items and talking points, with a plain-language version to share with the client."
      />
      <MeetingPrep />
    </>
  );
}
