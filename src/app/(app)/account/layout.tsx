import { PageHeader } from "@/components/ui/PageHeader";
import { AccountNav } from "@/components/account/AccountNav";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Account" description="Manage your Viridia account, preferences and data." />
      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <AccountNav />
        <div className="min-w-0 max-w-[880px]">{children}</div>
      </div>
    </>
  );
}
