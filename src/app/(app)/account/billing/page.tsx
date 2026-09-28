import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { CURRENT_PLAN } from "@/lib/plan";
import { SettingsRow, SettingsSection } from "@/components/ui/SettingsRow";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "Plan & Billing" };

/**
 * Billing shows only what is true. Viridia has no payment processor yet, so there is no payment
 * method, invoice or renewal to display, and nothing to cancel.
 */
export default async function BillingPage() {
  const v = await getViewer();
  if (!v) redirect("/signin?next=/account/billing");
  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title="Current plan">
        <div className="card px-5 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-[17px] font-semibold tracking-[-0.015em]">{CURRENT_PLAN.name}</span>
            <span className="num text-[15px] font-medium">{CURRENT_PLAN.price}</span>
          </div>
          <p className="page-desc mt-1 text-[13.5px]">{CURRENT_PLAN.summary}</p>
          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            <div>
              <div className="caption mb-2">Included</div>
              <ul className="flex flex-col gap-1.5 text-[13.5px]">
                {CURRENT_PLAN.includes.map((i) => <li key={i} className="flex gap-2"><Icon name="check" className="mt-[3px] h-[14px] w-[14px] text-brand" />{i}</li>)}
              </ul>
            </div>
            <div>
              <div className="caption mb-2">In development</div>
              <ul className="flex flex-col gap-1.5 text-[13.5px] text-fg-2">
                {CURRENT_PLAN.notYet.map((i) => <li key={i} className="flex gap-2"><span className="mt-[9px] h-1 w-1 flex-none rounded-full bg-fg-3" />{i}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Billing" description="Paid plans haven't launched. When they do, you'll choose one here before anything is charged.">
        <SettingsRow label="Billing cycle"><span className="text-[13.5px] text-fg-3">None</span></SettingsRow>
        <SettingsRow label="Payment method"><span className="text-[13.5px] text-fg-3">No card on file</span></SettingsRow>
        <SettingsRow label="Billing email"><span className="text-[13.5px]">{v.email}</span></SettingsRow>
        <SettingsRow label="Invoices"><span className="text-[13.5px] text-fg-3">You have never been charged</span></SettingsRow>
      </SettingsSection>
    </div>
  );
}
